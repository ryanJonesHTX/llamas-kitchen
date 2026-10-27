import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { toCardData } from '../../lib/recipes/card'
import { recipeImageUrl } from '../../lib/recipes/image'
import type { RecipeCardRecord } from '../../lib/recipes/listing'
import { day } from '../fixtures/recipes'

// toCardData turns a listing record into the serializable value a RecipeCard
// renders, so cards can render in client components.

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const record = (overrides: Partial<RecipeCardRecord> = {}): RecipeCardRecord => ({
  _id: new Types.ObjectId('65a000000000000000000001'),
  name: 'Beef Stew',
  slug: 'beef-stew',
  prepTime: 20,
  cookTime: 120,
  tags: ['beef', 'stew'],
  imagePublicId: 'recipes/beef-stew',
  publishedAt: day(1),
  ...overrides,
})

describe('toCardData', () => {
  it('keeps only the card fields, with the id as a hex string and a card-size image URL', () => {
    expect(toCardData(record())).toStrictEqual({
      id: '65a000000000000000000001',
      name: 'Beef Stew',
      slug: 'beef-stew',
      prepTime: 20,
      cookTime: 120,
      tags: ['beef', 'stew'],
      imageUrl: recipeImageUrl('recipes/beef-stew', 'card'),
    })
  })

  it('gives a null imageUrl to a recipe without an image', () => {
    expect(toCardData(record({ imagePublicId: undefined })).imageUrl).toBeNull()
  })

  it('survives a JSON round trip unchanged', () => {
    const card = toCardData(record())
    expect(JSON.parse(JSON.stringify(card))).toStrictEqual(card)
  })
})
