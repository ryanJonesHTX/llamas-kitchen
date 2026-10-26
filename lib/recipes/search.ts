import type { QueryFilter } from 'mongoose'
import { z } from 'zod'
import { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS } from '../constants'
import type { RecipeRecord } from './model'
import { searchWords } from './searchWords'

// Recipe search by word prefix: every word of the query must match the start
// of a word in the name, an ingredient's item or a tag. Server-only; the
// /recipes listing and /api/search share it.

// The q param: the trimmed search text, or undefined when blank. Text with no
// words (only punctuation) is still a search, one that matches nothing.
// Too long, too many words or a repeated q (an array) is malformed.
export const searchQueryParam = z
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

const SEARCHED_FIELDS = ['name', 'ingredients.item', 'tags'] as const

const ONE_WORD = /^[\p{L}\p{N}]+$/u

// A word matches at the start of a field or right after a character that is
// not a letter or digit, ignoring case. Words come from searchWords, so they
// hold only letters and digits: that is what makes them safe to put in a
// regex unescaped, and anything else throws.
function wordsFilter(words: string[], fields: readonly string[]): QueryFilter<RecipeRecord> {
  if (words.length === 0) throw new Error('searchFilter: needs at least one word')
  const bad = words.find((word) => !ONE_WORD.test(word))
  if (bad !== undefined) throw new Error(`searchFilter: not a search word: ${JSON.stringify(bad)}`)
  return {
    $and: words.map((word) => {
      const atWordStart = { $regex: `(?:^|[^\\p{L}\\p{N}])${word}`, $options: 'i' }
      return { $or: fields.map((field) => ({ [field]: atWordStart })) }
    }),
  }
}

// Every word matches in some searched field.
export function searchFilter(words: string[]): QueryFilter<RecipeRecord> {
  return wordsFilter(words, SEARCHED_FIELDS)
}

// Every word matches in the name.
export function nameSearchFilter(words: string[]): QueryFilter<RecipeRecord> {
  return wordsFilter(words, ['name'])
}
