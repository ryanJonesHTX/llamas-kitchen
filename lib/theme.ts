// The color theme choice, stored in a cookie the client writes and the root
// layout reads. Shared by server and client code.
export const THEME_COOKIE = 'theme'

export const THEMES = ['system', 'light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

// Anything that isn't exactly one of THEMES counts as system.
export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? 'system'
}
