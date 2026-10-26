// The search tokenizer. Kept apart from search.ts so client components (the
// search dialog) can import it without the database code.

const WORD = /[\p{L}\p{N}]+/gu

// The query's distinct words, lowercased. Anything but letters and digits separates words.
export function searchWords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(WORD) ?? [])]
}
