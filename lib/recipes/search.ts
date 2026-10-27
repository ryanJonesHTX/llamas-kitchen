import type { QueryFilter } from 'mongoose'
import { z } from 'zod'
import { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS } from '../constants'
import type { RecipeRecord } from './model'
import { searchWords } from './searchWords'

// Recipe search by word prefix: every word of the query must match the start
// of a word in the name, an ingredient's item or a tag, ignoring case and
// accents on Latin letters. Server-only; the /recipes listing and /api/search
// share it.

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

// Each ASCII letter with accented variants, and each of those variants, ->
// a class of the letter and its lowercase precomposed variants in Latin-1
// Supplement and Latin Extended-A, e.g. e and è -> [eèéêëēĕėęě]. The i option
// covers the uppercase variants. Any other letter (ø, æ, ß, ở, 김...) is not
// in the map and matches only itself.
const ACCENT_CLASSES = (() => {
  const variants = new Map<string, string>()
  for (let code = 0xc0; code <= 0x17f; code++) {
    const letter = String.fromCodePoint(code)
    const base = letter.normalize('NFD').replace(/\p{M}/gu, '')
    if (letter === letter.toLowerCase() && /^[a-z]$/.test(base)) variants.set(base, (variants.get(base) ?? base) + letter)
  }
  const classes = new Map<string, string>()
  for (const letters of variants.values()) for (const letter of letters) classes.set(letter, `[${letters}]`)
  return classes
})()

// The word as a regex matching it with or without accents: "crème" -> "cr[eèé...]m[eèé...]".
function accentInsensitive(word: string): string {
  return [...word].map((char) => ACCENT_CLASSES.get(char) ?? char).join('')
}

// A word matches at the start of a field or right after a character that is
// not a letter or digit, ignoring case and accents. Words come from
// searchWords, so they hold only letters and digits, and accentInsensitive
// emits only those or a class from its table: that is what makes them safe
// to put in a regex unescaped, and anything else throws.
function wordsFilter(words: string[], fields: readonly string[]): QueryFilter<RecipeRecord> {
  if (words.length === 0) throw new Error('searchFilter: needs at least one word')
  const bad = words.find((word) => !ONE_WORD.test(word))
  if (bad !== undefined) throw new Error(`searchFilter: not a search word: ${JSON.stringify(bad)}`)
  return {
    $and: words.map((word) => {
      const atWordStart = { $regex: `(?:^|[^\\p{L}\\p{N}])${accentInsensitive(word)}`, $options: 'i' }
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
