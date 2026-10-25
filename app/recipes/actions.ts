'use server'

import { revalidatePath } from 'next/cache'
import { Error as mongooseError, isObjectIdOrHexString, mongo, Types, type HydratedDocument } from 'mongoose'
import { z } from 'zod'
import type { Session } from 'next-auth'
import { MAX_PENDING_PER_USER, MAX_REJECTION_REASON_LENGTH } from '../../lib/constants'
import { requireAdminSession, requireUserSession } from '../../lib/guards'
import dbConnect from '../../lib/dbConnect'
import { requireEnv } from '../../lib/env'
import { IMAGE_HEADER_BYTES, matchesImageType } from '../../lib/imageType'
import { recipeInputSchema } from '../../lib/recipes/input'
import { Recipe, type RecipeRecord } from '../../lib/recipes/model'
import { canEdit } from '../../lib/recipes/permissions'
import { uniqueSlug } from '../../lib/recipes/slug'
import { isAdmin } from '../../lib/roles'
import { SLUG_PATTERN } from '../../lib/slugify'
import { signUploadParams } from '../../lib/uploadSignature'
import {
  ALLOWED_FORMATS,
  MAX_UPLOAD_BYTES,
  UPLOAD_FOLDER,
  UPLOAD_TOO_LARGE_MESSAGE,
  UPLOAD_TRANSFORMATION,
} from '../../lib/uploads'

// Write path for recipes. Server actions are public POST endpoints, so every
// action checks the session itself, before anything else. Any signed-in user
// may submit a recipe; a non-admin's waits for review, and only admins
// approve or reject it.

export type FieldErrors = Record<string, string[]>

export type SaveResult = { ok: true; slug: string } | { ok: false; fieldErrors: FieldErrors } | { ok: false; formError: string }

export type UploadResult = { ok: true; publicId: string } | { ok: false; error: string }

export type ReviewResult = { ok: true } | { ok: false; fieldErrors: FieldErrors } | { ok: false; formError: string }

// An admin edit may also change the slug.
const recipeUpdateSchema = recipeInputSchema.extend({
  slug: z.string().regex(SLUG_PATTERN, 'lowercase letters and numbers joined by single hyphens'),
})

const UPLOAD_TIMEOUT_MS = 30_000

const SLUG_TAKEN: SaveResult = { ok: false, fieldErrors: { slug: ['another recipe already uses this slug'] } }

const PENDING_CAP_MESSAGE = `You have ${MAX_PENDING_PER_USER} recipes waiting for review. You can submit more once they've been reviewed.`

// The same answer for a missing recipe and one already reviewed.
const NOT_PENDING: ReviewResult = { ok: false, formError: 'This recipe is no longer waiting for review.' }

const CHANGED: ReviewResult = {
  ok: false,
  formError: 'This recipe changed since you loaded the queue. Reload to see the latest version.',
}

const rejectionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Please give a reason.')
    .max(MAX_REJECTION_REASON_LENGTH, `must be at most ${MAX_REJECTION_REASON_LENGTH} characters`),
})

function fieldErrorsOf(error: z.ZodError): { ok: false; fieldErrors: FieldErrors } {
  return { ok: false, fieldErrors: z.flattenError(error).fieldErrors as FieldErrors }
}

// The save's $where pin matched nothing: the recipe changed since it was
// loaded. Mongoose reports that as a VersionError when the save changed an
// array, else as a DocumentNotFoundError.
function matchedNothing(error: unknown): boolean {
  return error instanceof mongooseError.DocumentNotFoundError || error instanceof mongooseError.VersionError
}

// Whether a non-admin already has as many recipes awaiting review as allowed.
// Two submissions at once can both pass; the cap is a speed bump, not a lock.
async function atPendingCap(session: Session): Promise<boolean> {
  if (isAdmin(session)) return false
  await dbConnect()
  const pending = await Recipe.countDocuments({ submittedBy: new Types.ObjectId(session.user.id), status: 'pending' })
  return pending >= MAX_PENDING_PER_USER
}

// The unique slug index rejected a write: another recipe took the slug after it was checked.
function isDuplicateSlug(error: unknown): boolean {
  return error instanceof mongo.MongoServerError && error.code === 11000 && 'slug' in (error.keyPattern ?? {})
}

// An admin's recipe publishes at once; anyone else's is pending, with no publishedAt.
export async function createRecipe(input: unknown): Promise<SaveResult> {
  const session = await requireUserSession()
  if (await atPendingCap(session)) return { ok: false, formError: PENDING_CAP_MESSAGE }
  const parsed = recipeInputSchema.safeParse(input)
  if (!parsed.success) return fieldErrorsOf(parsed.error)

  await dbConnect()
  const slug = await uniqueSlug(parsed.data.name)
  const admin = isAdmin(session)
  try {
    await Recipe.create({
      ...parsed.data,
      slug,
      submittedBy: new Types.ObjectId(session.user.id),
      status: admin ? 'published' : 'pending',
      publishedAt: admin ? new Date() : undefined,
    })
  } catch (error) {
    if (isDuplicateSlug(error)) return SLUG_TAKEN
    throw error
  }
  return { ok: true, slug }
}

// Replaces the input fields, and for an admin the slug; submittedBy,
// publishedAt and createdAt are never touched. An owner saving their rejected
// recipe sends it back to review; otherwise the status is kept. Edits never
// meet the pending cap. Saved through doc.save() so the conditional
// validators run against the whole document.
export async function updateRecipe(id: string, input: unknown): Promise<SaveResult> {
  const session = await requireUserSession()
  // The same answer for a missing recipe and one this user may not edit
  // (or no longer may: an admin can approve it while the owner edits).
  const cantEdit: SaveResult = { ok: false, formError: "This recipe can't be edited." }
  // Typed as a string, but a client can send any value.
  if (typeof id !== 'string' || !isObjectIdOrHexString(id)) return cantEdit
  const admin = isAdmin(session)
  // An owner's input has no slug; one sent anyway is stripped.
  const schema = admin ? recipeUpdateSchema : recipeInputSchema
  const parsed = schema.safeParse(input)
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const data: Record<string, unknown> = parsed.data

  await dbConnect()
  const recipe = await Recipe.findById(id)
  if (!recipe || !canEdit(session, recipe)) return cantEdit
  // Saves only if the status is still the one canEdit saw: an admin approving
  // it meanwhile must not publish the owner's unreviewed edit.
  recipe.$where = { status: recipe.status }

  // Every schema field, so an optional one left out of the input is unset.
  for (const field of Object.keys(schema.shape)) recipe.set(field, data[field])
  if (recipe.isModified('slug') && (await Recipe.exists({ slug: recipe.slug, _id: { $ne: recipe._id } }))) {
    return SLUG_TAKEN
  }
  if (!admin && recipe.status === 'rejected') {
    recipe.status = 'pending'
    recipe.rejectionReason = undefined
  }
  try {
    await recipe.save()
  } catch (error) {
    if (isDuplicateSlug(error)) return SLUG_TAKEN
    // The status changed since the load.
    if (matchedNothing(error)) return cantEdit
    throw error
  }
  return { ok: true, slug: recipe.slug }
}

// The pending recipe with this id, as the admin saw it: `updatedAt` is the
// queue's copy (ms since the epoch), so a decision never lands on content
// the owner changed after the queue loaded. Its save only lands while the
// recipe is still pending and unedited, so two admins deciding at once, or
// an owner editing meanwhile, can't slip through between load and save.
async function loadForDecision(id: string, updatedAt: number): Promise<HydratedDocument<RecipeRecord> | ReviewResult> {
  // Typed, but a client can send any value.
  if (typeof id !== 'string' || !isObjectIdOrHexString(id) || !Number.isSafeInteger(updatedAt)) return NOT_PENDING
  await dbConnect()
  const recipe = await Recipe.findById(id)
  if (!recipe || recipe.status !== 'pending') return NOT_PENDING
  if (recipe.updatedAt.getTime() !== updatedAt) return CHANGED
  recipe.$where = { status: 'pending', updatedAt: recipe.updatedAt }
  return recipe
}

// Saves a decision through doc.save(), so the conditional validators check
// the new status against rejectionReason and publishedAt.
async function saveDecision(recipe: HydratedDocument<RecipeRecord>): Promise<ReviewResult> {
  try {
    await recipe.save()
  } catch (error) {
    // Decided or edited since the load.
    if (matchedNothing(error)) return CHANGED
    throw error
  }
  // Re-renders the queue in this action's response. Recipe pages and the list render per request.
  revalidatePath('/admin/queue')
  return { ok: true }
}

export async function approveRecipe(id: string, updatedAt: number): Promise<ReviewResult> {
  await requireAdminSession()
  const recipe = await loadForDecision(id, updatedAt)
  if ('ok' in recipe) return recipe
  recipe.status = 'published'
  recipe.publishedAt = new Date()
  recipe.rejectionReason = undefined
  return saveDecision(recipe)
}

// The submitter sees the reason on their recipe page.
export async function rejectRecipe(id: string, updatedAt: number, reason: string): Promise<ReviewResult> {
  await requireAdminSession()
  const parsed = rejectionSchema.safeParse({ reason })
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const recipe = await loadForDecision(id, updatedAt)
  if ('ok' in recipe) return recipe
  recipe.status = 'rejected'
  recipe.rejectionReason = parsed.data.reason
  return saveDecision(recipe)
}

// Checks size and type (declared MIME type and magic bytes), then uploads to
// Cloudinary with a signed request from the server. Cloudinary's response
// body is never returned or logged, since it can echo the signature. The
// pending cap doesn't apply: an owner at the cap may still edit their recipe's image.
export async function uploadRecipeImage(formData: FormData): Promise<UploadResult> {
  await requireUserSession()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Please choose an image file.' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: UPLOAD_TOO_LARGE_MESSAGE }
  const header = new Uint8Array(await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer())
  if (!matchesImageType(header, file.type)) {
    return { ok: false, error: 'Images must be JPEG, PNG, WebP, AVIF or HEIC.' }
  }

  const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME')
  const apiKey = requireEnv('CLOUDINARY_API_KEY')
  const apiSecret = requireEnv('CLOUDINARY_API_SECRET')

  const params = {
    folder: UPLOAD_FOLDER,
    timestamp: Math.floor(Date.now() / 1000),
    allowed_formats: ALLOWED_FORMATS,
    transformation: UPLOAD_TRANSFORMATION,
  }
  const body = new FormData()
  body.set('file', file)
  body.set('api_key', apiKey)
  for (const [name, value] of Object.entries(params)) body.set(name, String(value))
  body.set('signature', signUploadParams(params, apiSecret))

  const uploadFailed: UploadResult = { ok: false, error: 'The image could not be uploaded. Please try again.' }
  let response: Response
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'TimeoutError')) throw error
    console.error(`Cloudinary upload timed out after ${UPLOAD_TIMEOUT_MS} ms`)
    return uploadFailed
  }
  if (!response.ok) {
    console.error(`Cloudinary upload failed with status ${response.status}`)
    return uploadFailed
  }
  const { public_id: publicId } = (await response.json()) as { public_id: unknown }
  if (typeof publicId !== 'string') throw new Error('Cloudinary upload response has no public_id')
  return { ok: true, publicId }
}
