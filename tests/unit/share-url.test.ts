import { afterEach, describe, expect, it, vi } from 'vitest'
import { recipeShareUrl } from '../../lib/metadata'

// The link the recipe page's Share button shares: the recipe's path on the
// site's public origin (AUTH_URL), with nothing else attached.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('recipeShareUrl', () => {
  it('is the recipe page on the AUTH_URL origin', () => {
    vi.stubEnv('AUTH_URL', 'https://llamas.example.com')
    expect(recipeShareUrl('beef-stew')).toBe('https://llamas.example.com/recipes/beef-stew')
  })

  it('keeps a non-default port', () => {
    vi.stubEnv('AUTH_URL', 'http://127.0.0.1:3100')
    expect(recipeShareUrl('beef-stew')).toBe('http://127.0.0.1:3100/recipes/beef-stew')
  })

  it('does not double the slash when AUTH_URL ends with one', () => {
    vi.stubEnv('AUTH_URL', 'https://llamas.example.com/')
    expect(recipeShareUrl('beef-stew')).toBe('https://llamas.example.com/recipes/beef-stew')
  })

  it('carries no query string or hash, even if AUTH_URL has them', () => {
    vi.stubEnv('AUTH_URL', 'https://llamas.example.com/?utm_source=x#top')
    expect(recipeShareUrl('beef-stew')).toBe('https://llamas.example.com/recipes/beef-stew')
  })

  it('throws when AUTH_URL is not set', () => {
    vi.stubEnv('AUTH_URL', '')
    expect(() => recipeShareUrl('beef-stew')).toThrow('AUTH_URL is not set')
  })
})
