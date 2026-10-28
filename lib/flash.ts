// A one-shot message for the next page: RecipeForm sets the cookie just
// before it navigates, and the Toaster reads, clears and shows it. A change
// that stays on the page (a review decision) sets it and then dispatches
// FLASH_EVENT on window. The cookie holds only a key from FLASH_MESSAGES,
// never free text.
export const FLASH_COOKIE = 'flash'

export const FLASH_EVENT = 'flash'

const FLASH_MAX_AGE_SECONDS = 60

const FLASH_MESSAGES = {
  saved: 'Recipe saved',
  submitted: 'Recipe submitted for review',
  approved: 'Recipe approved',
  rejected: 'Recipe rejected',
  deleted: 'Recipe deleted',
  linkCopied: 'Link copied',
  copyFailed: "Couldn't copy the link",
} as const

export type FlashKey = keyof typeof FLASH_MESSAGES

export type FlashTone = 'success' | 'error'

// Every flash is a success unless listed here.
const ERROR_KEYS: ReadonlySet<FlashKey> = new Set(['copyFailed'])

// document.cookie assignments that set the flash and clear it.
export function flashCookie(key: FlashKey): string {
  return `${FLASH_COOKIE}=${key}; Path=/; Max-Age=${FLASH_MAX_AGE_SECONDS}; SameSite=Lax`
}

export const CLEAR_FLASH_COOKIE = `${FLASH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`

// The flash cookie's raw value in a document.cookie string, if it is set.
export function flashCookieValue(documentCookie: string): string | undefined {
  const prefix = `${FLASH_COOKIE}=`
  return documentCookie
    .split('; ')
    .find((pair) => pair.startsWith(prefix))
    ?.slice(prefix.length)
}

// Unknown keys map to null and are ignored.
export function flashMessage(key: string | undefined): string | null {
  return Object.hasOwn(FLASH_MESSAGES, key ?? '') ? FLASH_MESSAGES[key as FlashKey] : null
}

// The Toaster's icon for a flash. Unknown keys map to null.
export function flashTone(key: string | undefined): FlashTone | null {
  if (!Object.hasOwn(FLASH_MESSAGES, key ?? '')) return null
  return ERROR_KEYS.has(key as FlashKey) ? 'error' : 'success'
}
