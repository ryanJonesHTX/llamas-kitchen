import { isObjectIdOrHexString, type Types } from 'mongoose'
import dbConnect from '../dbConnect'
import { CARD_FIELDS, type RecipeCardRecord } from './listing'
import { Recipe, type RecipeRecord } from './model'

export type { RecipeRecord }

export type RecipeSearchOption = { name: string; href: string }

// A pending recipe as the review queue lists it. submitter is the user's name
// or email, or null when their account is gone. updatedAt goes back with a
// decision, so one never lands on content the admin didn't see.
export type QueueEntry = Pick<RecipeRecord, '_id' | 'name' | 'slug' | 'description' | 'createdAt' | 'updatedAt'> & {
  submitter: string | null
}

// The fields queueEntries reads from the Auth.js users collection.
type UserRecord = { _id: Types.ObjectId; name?: string | null; email: string }

const PUBLISHED = { status: 'published' } as const

// Newest published first, ties broken by _id, matching the list cursor.
const NEWEST_FIRST = { publishedAt: -1, _id: -1 } as const

// For redirecting old /<id> URLs; null for an unknown or malformed id.
export async function getPublishedSlugById(id: string): Promise<string | null> {
  if (!isObjectIdOrHexString(id)) return null
  await dbConnect()
  const recipe = await Recipe.findOne({ ...PUBLISHED, _id: id }, { slug: 1 }).lean<Pick<RecipeRecord, 'slug'>>()
  return recipe?.slug ?? null
}

export async function latestPublished(n: number): Promise<RecipeCardRecord[]> {
  // Mongo reads a limit of 0 as no limit.
  if (!Number.isInteger(n) || n < 1) throw new Error(`latestPublished: n must be a positive integer, got ${n}`)
  await dbConnect()
  return Recipe.find(PUBLISHED, CARD_FIELDS).sort(NEWEST_FIRST).limit(n).lean<RecipeCardRecord[]>()
}

export async function publishedSearchOptions(): Promise<RecipeSearchOption[]> {
  await dbConnect()
  const recipes = await Recipe.find(PUBLISHED, { _id: 0, name: 1, slug: 1 }).lean<
    Pick<RecipeRecord, 'name' | 'slug'>[]
  >()
  return recipes.map(({ name, slug }) => ({ name, href: `/recipes/${slug}` }))
}

export async function publishedTagsInUse(): Promise<string[]> {
  await dbConnect()
  const tags: string[] = await Recipe.distinct('tags', PUBLISHED)
  return tags.sort()
}

// Any status. Callers guard access with canView or canEdit (./permissions).
export async function getRecipeBySlug(slug: string): Promise<RecipeRecord | null> {
  await dbConnect()
  return Recipe.findOne({ slug }).lean<RecipeRecord>()
}

// Pending recipes oldest first (the { status, createdAt } index), with their
// submitters looked up in one query.
export async function queueEntries(): Promise<QueueEntry[]> {
  await dbConnect()
  const recipes = await Recipe.find({ status: 'pending' }, { name: 1, slug: 1, description: 1, createdAt: 1, updatedAt: 1, submittedBy: 1 })
    .sort({ createdAt: 1 })
    .lean<(Omit<QueueEntry, 'submitter'> & Pick<RecipeRecord, 'submittedBy'>)[]>()
  const users = await Recipe.db
    .collection<UserRecord>('users')
    .find({ _id: { $in: recipes.map((recipe) => recipe.submittedBy) } }, { projection: { name: 1, email: 1 } })
    .toArray()
  const submitters = new Map(users.map((user) => [String(user._id), user.name || user.email]))
  return recipes.map(({ submittedBy, ...recipe }) => ({ ...recipe, submitter: submitters.get(String(submittedBy)) ?? null }))
}
