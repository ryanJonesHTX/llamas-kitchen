import { describe, expect, it } from 'vitest'
import { copyParams, originalUrl, targetPublicId } from '../../scripts/migrate-image-folder/copy'
import { IMAGE_PUBLIC_ID_PATTERN } from '../../lib/uploads'

describe('targetPublicId', () => {
  it.each([
    ['recipe-images/hohsrcizyp6hczb5moun', 'recipes/hohsrcizyp6hczb5moun'],
    ['a/b/c_d-1', 'recipes/c_d-1'],
    ['loose', 'recipes/loose'],
  ])('copies %j to %j, which the strict pattern accepts', (oldId, target) => {
    expect(targetPublicId(oldId)).toBe(target)
    expect(target).toMatch(IMAGE_PUBLIC_ID_PATTERN)
  })

  it.each([['recipe-images/'], ['recipe-images/a.jpg'], ['recipe-images/a b'], ['']])('throws on %j', (oldId) => {
    expect(() => targetPublicId(oldId)).toThrow()
  })
})

describe('originalUrl', () => {
  it('is the untransformed delivery URL', () => {
    expect(originalUrl('demo', 'recipe-images/abc')).toBe('https://res.cloudinary.com/demo/image/upload/recipe-images/abc')
  })
})

describe('copyParams', () => {
  it('names the copy inside the upload folder, never overwrites, and has no transformation', () => {
    expect(copyParams('recipe-images/abc', 1700000000)).toEqual({
      folder: 'recipes',
      public_id: 'abc',
      overwrite: 'false',
      timestamp: 1700000000,
    })
  })
})
