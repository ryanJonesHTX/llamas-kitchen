import { describe, expect, it } from 'vitest'
import { parseTheme, THEME_COOKIE, THEMES } from '../../lib/theme'

describe('theme constants', () => {
  it('stores the choice in a cookie named "theme"', () => {
    expect(THEME_COOKIE).toBe('theme')
  })

  it('offers system, light and dark, in that order', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark'])
  })
})

describe('parseTheme', () => {
  it.each([['system'], ['light'], ['dark']])('keeps the valid value %j', (value) => {
    expect(parseTheme(value)).toBe(value)
  })

  it.each([[undefined], [''], ['DARK'], ['Light'], ['blue'], [' dark'], ['dark ']])(
    'treats %j as system',
    (value) => {
      expect(parseTheme(value)).toBe('system')
    }
  )
})
