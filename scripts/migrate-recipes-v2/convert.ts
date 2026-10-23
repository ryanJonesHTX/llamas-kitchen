// Pure conversion of one old-shape recipe to the Phase 2 model
// (.claude/SCHEMA-PROPOSAL.md). No database access.
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { parseIngredient } from '../../lib/ingredients.ts'

const trimmedText = z.string().trim().min(1)
const minutes = z.number().int().min(0)

// The exact target shape, field by field from the proposal. Unknown keys are rejected.
export const migratedRecipeSchema = z
  .strictObject({
    _id: z.instanceof(ObjectId),
    name: trimmedText.max(120),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    description: trimmedText,
    ingredients: z
      .array(
        z.strictObject({
          quantity: z.number().positive().nullable(),
          unit: z.string().trim().nullable(),
          item: trimmedText,
        })
      )
      .min(1),
    steps: z.array(trimmedText).min(1),
    servings: z.number().int().min(1),
    prepTime: minutes,
    cookTime: minutes,
    tags: z
      .array(z.string().min(1).refine((tag) => tag === tag.trim().toLowerCase(), 'not lowercase and trimmed'))
      .max(10)
      .refine((tags) => new Set(tags).size === tags.length, 'not unique'),
    imagePublicId: trimmedText.optional(),
    notes: trimmedText.optional(),
    credit: trimmedText.optional(),
    sourceUrl: z.url().optional(),
    submittedBy: z.instanceof(ObjectId),
    status: z.enum(['pending', 'published', 'rejected']),
    rejectionReason: trimmedText.optional(),
    publishedAt: z.date().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    __v: z.number().int().min(0).optional(),
  })
  .refine((doc) => (doc.status === 'rejected') === (doc.rejectionReason !== undefined), {
    path: ['rejectionReason'],
    message: 'required when status is rejected, otherwise absent',
  })
  .refine((doc) => (doc.status === 'published') === (doc.publishedAt !== undefined), {
    path: ['publishedAt'],
    message: 'required when status is published, otherwise absent',
  })

export type MigratedRecipe = z.infer<typeof migratedRecipeSchema>

type Doc = Record<string, unknown>

const OLD_KEYS = new Set([
  '_id', 'name', 'description', 'directions', 'ingredients', 'prepTime', 'cookTime',
  'photo', 'cloudinaryId', 'category', 'submittedBy', 'notes', 'createdAt', 'updatedAt', '__v',
])

// https://res.cloudinary.com/<cloud>/image/upload/[<transformation>/...]v<digits>/<publicId>.<ext>
// Anchored on the version: the app always saved secure_url, which has one.
const PHOTO_URL = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*?v\d+\/(.+)\.[a-z0-9]+$/i

export function isMigrated(doc: Doc): boolean {
  return migratedRecipeSchema.safeParse(doc).success
}

// The trimmed string at doc[key], or undefined when absent or blank.
function optionalText(doc: Doc, key: string, problems: string[]): string | undefined {
  const value = doc[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    problems.push(`${key} is not a string`)
    return undefined
  }
  return value.trim() || undefined
}

function requiredText(doc: Doc, key: string, problems: string[]): string {
  const text = optionalText(doc, key, problems)
  if (text === undefined) problems.push(`${key} is missing or blank`)
  return text ?? ''
}

// Whole minutes from a number or a numeric string.
function toMinutes(doc: Doc, key: string, problems: string[]): number {
  const value = doc[key]
  const number =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN
  if (!Number.isInteger(number) || number < 0) {
    problems.push(`${key} is not a whole number of minutes: ${JSON.stringify(value)}`)
  }
  return number
}

function toIngredients(doc: Doc, problems: string[]) {
  const value = doc.ingredients
  if (!Array.isArray(value)) {
    problems.push('ingredients is not an array')
    return []
  }
  const lines: string[] = []
  for (const entry of value) {
    if (typeof entry?.ingredient !== 'string') {
      problems.push(`ingredients has an entry without ingredient text: ${JSON.stringify(entry)}`)
    } else if (entry.ingredient.trim()) {
      lines.push(entry.ingredient)
    }
  }
  if (lines.length === 0) problems.push('ingredients has no non-blank entries')
  return lines.map(parseIngredient)
}

function toSteps(doc: Doc, problems: string[]): string[] {
  const directions = requiredText(doc, 'directions', problems)
  return directions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function toTags(category: string | undefined): string[] {
  if (category === undefined || category === 'Select a Category') return []
  const tag = category.toLowerCase()
  return [tag === 'sweets' ? 'dessert' : tag]
}

function toImagePublicId(doc: Doc, problems: string[]): string | undefined {
  const cloudinaryId = optionalText(doc, 'cloudinaryId', problems)
  if (cloudinaryId) return cloudinaryId
  const photo = optionalText(doc, 'photo', problems)
  if (!photo) return undefined
  const match = photo.match(PHOTO_URL)
  if (!match) problems.push(`photo is not a Cloudinary image URL: ${photo}`)
  return match?.[1]
}

// Converts an old-shape recipe. Problems name the field they are about.
export function convertRecipe(
  oldDoc: Doc,
  { adminUserId, slug }: { adminUserId: ObjectId; slug: string }
): { doc: MigratedRecipe } | { problems: string[] } {
  const problems = Object.keys(oldDoc)
    .filter((key) => !OLD_KEYS.has(key))
    .map((key) => `${key} is not a known old-shape field`)

  const name = requiredText(oldDoc, 'name', problems)
  const description = requiredText(oldDoc, 'description', problems)
  const ingredients = toIngredients(oldDoc, problems)
  const steps = toSteps(oldDoc, problems)
  const prepTime = toMinutes(oldDoc, 'prepTime', problems)
  const cookTime = toMinutes(oldDoc, 'cookTime', problems)
  const tags = toTags(optionalText(oldDoc, 'category', problems))
  const imagePublicId = toImagePublicId(oldDoc, problems)
  const credit = optionalText(oldDoc, 'submittedBy', problems)
  const notes = optionalText(oldDoc, 'notes', problems)
  if (!(oldDoc.createdAt instanceof Date)) problems.push('createdAt is missing or not a date')
  if (problems.length) return { problems }

  const result = migratedRecipeSchema.safeParse({
    _id: oldDoc._id,
    name,
    slug,
    description,
    ingredients,
    steps,
    servings: 4,
    prepTime,
    cookTime,
    tags,
    ...(imagePublicId !== undefined && { imagePublicId }),
    ...(notes !== undefined && { notes }),
    ...(credit !== undefined && { credit }),
    submittedBy: adminUserId,
    status: 'published',
    publishedAt: oldDoc.createdAt,
    createdAt: oldDoc.createdAt,
    updatedAt: oldDoc.updatedAt,
    ...(oldDoc.__v !== undefined && { __v: oldDoc.__v }),
  })
  if (!result.success) {
    return { problems: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  }
  return { doc: result.data }
}
