// The search tokenizer. Kept apart from search.ts so client components (the
// search dialog) can import it without the database code.

const WORD = /[\p{L}\p{N}]+/gu

// The query's distinct words, lowercased. Anything but letters and digits separates words.
// NFC first, so a letter typed as base + combining accent stays one letter.
export function searchWords(text: string): string[] {
  return [...new Set(text.normalize('NFC').toLowerCase().match(WORD) ?? [])]
}
