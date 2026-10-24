import { isObjectIdOrHexString } from 'mongoose'
import dbConnect from '../dbConnect'
import { Recipe, type RecipeRecord } from './model'

export type { RecipeRecord }

export type RecipeSearchOption = { name: string; href: string }

const PUBLISHED = { status: 'published' } as const

// Newest published first, ties broken by _id, matching the list cursor.
const NEWEST_FIRST = { publishedAt: -1, _id: -1 } as const

export async function getPublishedBySlug(slug: string): Promise<RecipeRecord | null> {
  await dbConnect()
  return Recipe.findOne({ ...PUBLISHED, slug }).lean<RecipeRecord>()
}

// For redirecting old /<id> URLs; null for an unknown or malformed id.
export async function getPublishedSlugById(id: string): Promise<string | null> {
  if (!isObjectIdOrHexString(id)) return null
  await dbConnect()
  const recipe = await Recipe.findOne({ ...PUBLISHED, _id: id }, { slug: 1 }).lean<Pick<RecipeRecord, 'slug'>>()
  return recipe?.slug ?? null
}

export async function latestPublished(n: number): Promise<RecipeRecord[]> {
  // Mongo reads a limit of 0 as no limit.
  if (!Number.isInteger(n) || n < 1) throw new Error(`latestPublished: n must be a positive integer, got ${n}`)
  await dbConnect()
  return Recipe.find(PUBLISHED).sort(NEWEST_FIRST).limit(n).lean<RecipeRecord[]>()
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

// Any status: admins edit pending and rejected recipes too. Callers guard access.
export async function getRecipeForEdit(slug: string): Promise<RecipeRecord | null> {
  await dbConnect()
  return Recipe.findOne({ slug }).lean<RecipeRecord>()
}
