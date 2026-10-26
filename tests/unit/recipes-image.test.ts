import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recipeImageUrl, recipeImageUrlPrefix, type RecipeImageSize } from '../../lib/recipes/image'

// One helper builds every recipe image URL from the Cloudinary public ID.

const sizes: RecipeImageSize[] = ['thumb', 'card', 'hero', 'og']

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('recipeImageUrl', () => {
  it.each(sizes)('builds a %s delivery URL on the configured cloud, keeping folders in the public ID', (size) => {
    expect(recipeImageUrl('recipes/beef-stew', size)).toMatch(
      /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/[^/]+\/recipes\/beef-stew$/
    )
  })

  it.each(sizes)('asks for automatic format and quality for %s', (size) => {
    const url = recipeImageUrl('recipes/beef-stew', size)
    expect(url).toContain('f_auto')
    expect(url).toContain('q_auto')
  })

  it('crops the og size to 1200x630', () => {
    const url = recipeImageUrl('recipes/beef-stew', 'og')
    expect(url).toContain('c_fill')
    expect(url).toContain('w_1200')
    expect(url).toContain('h_630')
  })

  it('crops the thumb size to 96x96 around the subject', () => {
    const url = recipeImageUrl('recipes/beef-stew', 'thumb')
    expect(url).toContain('c_fill,g_auto,w_96,h_96')
  })

  it('gives each size a different URL', () => {
    const urls = sizes.map((size) => recipeImageUrl('recipes/beef-stew', size))
    expect(new Set(urls).size).toBe(sizes.length)
  })

  it('throws when CLOUDINARY_CLOUD_NAME is not set', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '')
    expect(() => recipeImageUrl('recipes/beef-stew', 'card')).toThrow(/CLOUDINARY_CLOUD_NAME/)
  })

  it('throws for a blank public ID', () => {
    expect(() => recipeImageUrl('  ', 'card')).toThrow()
  })
})

describe('recipeImageUrlPrefix', () => {
  it.each(sizes)('is the %s URL without the public ID', (size) => {
    expect(`${recipeImageUrlPrefix(size)}recipes/beef-stew`).toBe(recipeImageUrl('recipes/beef-stew', size))
  })

  it('throws when CLOUDINARY_CLOUD_NAME is not set', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '')
    expect(() => recipeImageUrlPrefix('card')).toThrow(/CLOUDINARY_CLOUD_NAME/)
  })
})
