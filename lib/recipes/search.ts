import type { QueryFilter } from 'mongoose'
import type { RecipeRecord } from './model'

// Recipe search by word prefix: every word of the query must match the start
// of a word in the name, an ingredient's item or a tag. Server-only; the
// /recipes listing and the header search share it.

const WORD = /[\p{L}\p{N}]+/gu

// The query's distinct words, lowercased. Anything but letters and digits separates words.
export function searchWords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(WORD) ?? [])]
}

const SEARCHED_FIELDS = ['name', 'ingredients.item', 'tags'] as const

const ONE_WORD = /^[\p{L}\p{N}]+$/u

// A word matches at the start of a field or right after a character that is
// not a letter or digit, ignoring case. Words come from searchWords, so they
// hold only letters and digits: that is what makes them safe to put in a
// regex unescaped, and anything else throws.
export function searchFilter(words: string[]): QueryFilter<RecipeRecord> {
  if (words.length === 0) throw new Error('searchFilter: needs at least one word')
  const bad = words.find((word) => !ONE_WORD.test(word))
  if (bad !== undefined) throw new Error(`searchFilter: not a search word: ${JSON.stringify(bad)}`)
  return {
    $and: words.map((word) => {
      const atWordStart = { $regex: `(?:^|[^\\p{L}\\p{N}])${word}`, $options: 'i' }
      return { $or: SEARCHED_FIELDS.map((field) => ({ [field]: atWordStart })) }
    }),
  }
}
