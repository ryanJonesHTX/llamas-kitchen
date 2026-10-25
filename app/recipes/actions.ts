'use server'

import { isObjectIdOrHexString, mongo, Types } from 'mongoose'
import { z } from 'zod'
import type { Session } from 'next-auth'
import { MAX_PENDING_PER_USER } from '../../lib/constants'
import { requireAdminSession, requireUserSession } from '../../lib/guards'
import dbConnect from '../../lib/dbConnect'
import { requireEnv } from '../../lib/env'
import { IMAGE_HEADER_BYTES, matchesImageType } from '../../lib/imageType'
import { recipeInputSchema } from '../../lib/recipes/input'
import { Recipe } from '../../lib/recipes/model'
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
// may submit a recipe; a non-admin's waits for review.

export type FieldErrors = Record<string, string[]>

export type SaveResult = { ok: true; slug: string } | { ok: false; fieldErrors: FieldErrors } | { ok: false; formError: string }

export type UploadResult = { ok: true; publicId: string } | { ok: false; error: string }

// An admin edit may also change the slug.
const recipeUpdateSchema = recipeInputSchema.extend({
  slug: z.string().regex(SLUG_PATTERN, 'lowercase letters and numbers joined by single hyphens'),
})

const UPLOAD_TIMEOUT_MS = 30_000

const SLUG_TAKEN: SaveResult = { ok: false, fieldErrors: { slug: ['another recipe already uses this slug'] } }

const PENDING_CAP_MESSAGE = `You have ${MAX_PENDING_PER_USER} recipes waiting for review. You can submit more once they've been reviewed.`

function fieldErrorsOf(error: z.ZodError): SaveResult {
  return { ok: false, fieldErrors: z.flattenError(error).fieldErrors as FieldErrors }
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

// Replaces the input fields and the slug; submittedBy, status, publishedAt and
// createdAt are never touched. Saved through doc.save() so the conditional
// validators run against the whole document.
export async function updateRecipe(id: string, input: unknown): Promise<SaveResult> {
  await requireAdminSession()
  const notFound: SaveResult = { ok: false, formError: 'This recipe no longer exists.' }
  // Typed as a string, but a client can send any value.
  if (typeof id !== 'string' || !isObjectIdOrHexString(id)) return notFound
  const parsed = recipeUpdateSchema.safeParse(input)
  if (!parsed.success) return fieldErrorsOf(parsed.error)

  await dbConnect()
  const recipe = await Recipe.findById(id)
  if (!recipe) return notFound
  if (await Recipe.exists({ slug: parsed.data.slug, _id: { $ne: recipe._id } })) return SLUG_TAKEN

  // Every schema field, so an optional one left out of the input is unset.
  for (const field of Object.keys(recipeUpdateSchema.shape) as (keyof typeof parsed.data)[]) {
    recipe.set(field, parsed.data[field])
  }
  try {
    await recipe.save()
  } catch (error) {
    if (isDuplicateSlug(error)) return SLUG_TAKEN
    throw error
  }
  return { ok: true, slug: recipe.slug }
}

// Checks size and type (declared MIME type and magic bytes), then uploads to
// Cloudinary with a signed request from the server. Cloudinary's response
// body is never returned or logged, since it can echo the signature. A
// non-admin at the pending cap couldn't save the recipe, so can't upload either.
export async function uploadRecipeImage(formData: FormData): Promise<UploadResult> {
  const session = await requireUserSession()
  if (await atPendingCap(session)) return { ok: false, error: PENDING_CAP_MESSAGE }
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
