import { Types, type QueryFilter } from 'mongoose'
import { z } from 'zod'
import {
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_WORDS,
  RECIPE_PAGE_SIZE,
  RECIPE_SORT_OPTIONS,
  TIME_FILTERS,
} from '../constants'
import dbConnect from '../dbConnect'
import { recipeInputSchema } from './input'
import { Recipe, type RecipeRecord } from './model'
import { searchFilter, searchWords } from './search'

// The /recipes listing: its URL search params and the paged query behind them.

// Where the list continues from: the last recipe of the previous page.
type Cursor = { publishedAt: Date; _id: Types.ObjectId }

// Search params as Next passes them to a page; a repeated param is an array.
export type ListingSearchParams = Record<string, string | string[] | undefined>

export type RecipeCardRecord = Pick<
  RecipeRecord,
  '_id' | 'name' | 'slug' | 'prepTime' | 'cookTime' | 'tags' | 'imagePublicId'
> & { publishedAt: Date }

export type ListingPage = { recipes: RecipeCardRecord[]; nextCursor: string | null }

// time=quick is a total (prepTime + cookTime) of at most this many minutes.
const QUICK_MAX_MINUTES = 80

// What a RecipeCard shows; the home page's latest recipes use it too.
export const CARD_FIELDS = { name: 1, slug: 1, prepTime: 1, cookTime: 1, tags: 1, imagePublicId: 1, publishedAt: 1 } as const

const CURSOR_PAYLOAD = /^(0|[1-9]\d*)_([0-9a-f]{24})$/

function encodeCursor({ publishedAt, _id }: Cursor): string {
  return Buffer.from(`${publishedAt.getTime()}_${_id.toHexString()}`).toString('base64url')
}

// Strict: Node's base64url decoder skips bad characters and padding, so a
// cursor only counts if it re-encodes to exactly itself.
function decodeCursor(cursor: string): Cursor | null {
  const payload = Buffer.from(cursor, 'base64url').toString()
  if (Buffer.from(payload).toString('base64url') !== cursor) return null
  const match = CURSOR_PAYLOAD.exec(payload)
  if (!match) return null
  const publishedAt = new Date(Number(match[1]))
  if (Number.isNaN(publishedAt.getTime())) return null
  return { publishedAt, _id: new Types.ObjectId(match[2]) }
}

// The shared tag rule normalizes and de-duplicates; in a URL a duplicate is malformed.
const tagsParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value, ctx) => {
    const raw = value === undefined ? [] : [value].flat()
    const parsed = recipeInputSchema.shape.tags.safeParse(raw)
    if (!parsed.success || parsed.data.length !== raw.length) {
      ctx.addIssue({ code: 'custom', message: 'invalid or duplicate tags' })
      return z.NEVER
    }
    return parsed.data
  })

const afterParam = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined
    const cursor = decodeCursor(value)
    if (!cursor) {
      ctx.addIssue({ code: 'custom', message: 'invalid cursor' })
      return z.NEVER
    }
    return cursor
  })

// The trimmed search text, or undefined when blank. Text with no words (only
// punctuation) is still a search, one that matches nothing.
const qParam = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const text = value?.trim()
    if (!text) return undefined
    if (text.length > MAX_SEARCH_QUERY_LENGTH || searchWords(text).length > MAX_SEARCH_WORDS) {
      ctx.addIssue({ code: 'custom', message: 'search too long' })
      return z.NEVER
    }
    return text
  })

// Unknown params are stripped; single-valued params reject arrays.
const listingParamsSchema = z.object({
  tag: tagsParam,
  time: z.literal(TIME_FILTERS.map((filter) => filter.value)).optional(),
  sort: z.literal(RECIPE_SORT_OPTIONS.map((option) => option.value)).default('newest'),
  after: afterParam,
  q: qParam,
})

export type ListingQuery = {
  tags: string[]
  time: (typeof TIME_FILTERS)[number]['value'] | undefined
  sort: (typeof RECIPE_SORT_OPTIONS)[number]['value']
  after: Cursor | undefined
  q: string | undefined
}

// null when any known param is malformed; the page then 404s.
export function parseListingParams(params: ListingSearchParams): ListingQuery | null {
  const parsed = listingParamsSchema.safeParse(params)
  if (!parsed.success) return null
  const { tag, time, sort, after, q } = parsed.data
  return { tags: tag, time, sort, after, q }
}

// One page of published recipes, ordered by (publishedAt, _id) and continuing after query.after.
export async function listPublished(query: ListingQuery, limit = RECIPE_PAGE_SIZE): Promise<ListingPage> {
  // Mongo reads a limit of 0 as no limit.
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`listPublished: limit must be a positive integer, got ${limit}`)
  const words = query.q === undefined ? [] : searchWords(query.q)
  if (query.q !== undefined && words.length === 0) return { recipes: [], nextCursor: null }
  await dbConnect()

  const filter: QueryFilter<RecipeRecord> = { status: 'published' }
  if (query.tags.length > 0) filter.tags = { $in: query.tags }
  if (query.time) {
    const op = query.time === 'quick' ? '$lte' : '$gt'
    filter.$expr = { [op]: [{ $add: ['$prepTime', '$cookTime'] }, QUICK_MAX_MINUTES] }
  }
  const direction = query.sort === 'newest' ? -1 : 1
  if (query.after) {
    const op = direction === -1 ? '$lt' : '$gt'
    const { publishedAt, _id } = query.after
    filter.$or = [{ publishedAt: { [op]: publishedAt } }, { publishedAt, _id: { [op]: _id } }]
  }
  // In $and, so it can't clobber the cursor's $or.
  if (words.length > 0) filter.$and = [searchFilter(words)]

  const found = await Recipe.find(filter, CARD_FIELDS)
    .sort({ publishedAt: direction, _id: direction })
    .limit(limit + 1)
    .lean<RecipeCardRecord[]>()
  const recipes = found.slice(0, limit)
  const nextCursor = found.length > limit ? encodeCursor(recipes[limit - 1]) : null
  return { recipes, nextCursor }
}
