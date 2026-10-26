import { isObjectIdOrHexString, type Types } from 'mongoose'
import dbConnect from '../dbConnect'
import { CARD_FIELDS, type RecipeCardRecord } from './listing'
import { Recipe, type RecipeRecord } from './model'
import { nameSearchFilter, searchFilter } from './search'

export type { RecipeRecord }

// A recipe as the search dialog lists it, before its image becomes a URL.
export type SearchHit = Pick<RecipeRecord, 'name' | 'slug' | 'tags' | 'imagePublicId'>

// A pending recipe as the review queue lists it. submitter is the user's name
// or email, or null when their account is gone. updatedAt goes back with a
// decision, so one never lands on content the admin didn't see.
export type QueueEntry = Pick<RecipeRecord, '_id' | 'name' | 'slug' | 'description' | 'createdAt' | 'updatedAt'> & {
  submitter: string | null
}

// A recipe as /my-recipes lists it. status and submittedBy feed canEdit.
export type SubmittedRecipe = Pick<
  RecipeRecord,
  'name' | 'slug' | 'status' | 'rejectionReason' | 'createdAt' | 'submittedBy'
>

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

// The top published matches for searchWords' words: those with every word in
// the name first, then the rest, each group newest first. The groups don't
// overlap, so they are fetched in parallel.
export async function searchPublished(words: string[], limit: number): Promise<SearchHit[]> {
  // Mongo reads a limit of 0 as no limit.
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`searchPublished: limit must be a positive integer, got ${limit}`)
  const inName = nameSearchFilter(words)
  const fields = { _id: 0, name: 1, slug: 1, tags: 1, imagePublicId: 1 }
  await dbConnect()
  const [nameHits, otherHits] = await Promise.all([
    Recipe.find({ ...PUBLISHED, ...inName }, fields).sort(NEWEST_FIRST).limit(limit).lean<SearchHit[]>(),
    Recipe.find({ ...PUBLISHED, $and: [searchFilter(words), { $nor: [inName] }] }, fields)
      .sort(NEWEST_FIRST)
      .limit(limit)
      .lean<SearchHit[]>(),
  ])
  return [...nameHits, ...otherHits].slice(0, limit)
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

// One user's recipes of any status, newest first (the { submittedBy, createdAt } index).
export async function submittedRecipes(userId: string): Promise<SubmittedRecipe[]> {
  await dbConnect()
  return Recipe.find(
    { submittedBy: userId },
    { _id: 0, name: 1, slug: 1, status: 1, rejectionReason: 1, createdAt: 1, submittedBy: 1 }
  )
    .sort({ createdAt: -1 })
    .lean<SubmittedRecipe[]>()
}
