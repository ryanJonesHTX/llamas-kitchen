import { normalizeTag } from './input'

// Pure helpers for the recipe form's tag input (components/TagInput.tsx).

// The normalized, non-blank tags in comma-separated text, like a paste of "a, b, c".
export function splitTags(text: string): string[] {
  return text.split(',').map(normalizeTag).filter(Boolean)
}

// Up to `limit` tags from `inUse` that contain `typed` (normalized text),
// those starting with it first, each group in `inUse` order, leaving out the
// `chosen` ones. Empty text matches every tag. None when the text is itself
// chosen, so the form reports the duplicate instead of offering a different tag.
export function suggestTags(typed: string, chosen: string[], inUse: string[], limit: number): string[] {
  if (chosen.includes(typed)) return []
  const available = inUse.filter((tag) => !chosen.includes(tag))
  const prefixed = available.filter((tag) => tag.startsWith(typed))
  const containing = available.filter((tag) => !tag.startsWith(typed) && tag.includes(typed))
  return [...prefixed, ...containing].slice(0, limit)
}
