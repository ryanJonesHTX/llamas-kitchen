import { describe, expect, it } from 'vitest'
import { CLEAR_FLASH_COOKIE, FLASH_COOKIE, flashCookie, flashCookieValue, flashMessage } from '../../lib/flash'

describe('flash constants', () => {
  it('uses a cookie named "flash"', () => {
    expect(FLASH_COOKIE).toBe('flash')
  })
})

describe('flashCookie', () => {
  it('sets the key for the whole site, for 60 seconds, SameSite=Lax', () => {
    expect(flashCookie('saved')).toBe('flash=saved; Path=/; Max-Age=60; SameSite=Lax')
  })

  it('is cleared with the same path', () => {
    expect(CLEAR_FLASH_COOKIE).toBe('flash=; Path=/; Max-Age=0; SameSite=Lax')
  })

  it('round-trips through flashCookieValue and flashMessage', () => {
    const pair = flashCookie('saved').split('; ')[0]
    expect(flashMessage(flashCookieValue(`theme=dark; ${pair}`))).toBe('Recipe saved')
  })
})

describe('flashCookieValue', () => {
  it.each([
    ['flash=saved', 'saved'],
    ['theme=dark; flash=saved', 'saved'],
    ['flash=saved; theme=dark', 'saved'],
    ['flash=', ''],
  ])('reads the flash value from %j', (documentCookie, value) => {
    expect(flashCookieValue(documentCookie)).toBe(value)
  })

  it.each([[''], ['theme=dark'], ['myflash=saved'], ['theme=dark; xflash=saved']])(
    'finds no flash cookie in %j',
    (documentCookie) => {
      expect(flashCookieValue(documentCookie)).toBeUndefined()
    }
  )
})

describe('flashMessage', () => {
  it('maps "saved" to "Recipe saved"', () => {
    expect(flashMessage('saved')).toBe('Recipe saved')
  })

  it('maps "submitted" to "Recipe submitted for review"', () => {
    expect(flashMessage('submitted')).toBe('Recipe submitted for review')
  })

  it.each([[undefined], [''], ['Saved'], ['hacked'], ['<b>hi</b>'], ['toString'], ['__proto__'], ['constructor']])(
    'ignores the unknown key %j',
    (key) => {
      expect(flashMessage(key)).toBeNull()
    }
  )
})
