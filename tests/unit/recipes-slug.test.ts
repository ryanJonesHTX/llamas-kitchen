import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'

// uniqueSlug(name) against an in-memory MongoDB: slugify(name), then -2, -3, ...
// while the slug is taken by any recipe, whatever its status.

let mongo: MongoMemoryServer
let uniqueSlug: typeof import('../../lib/recipes/slug').uniqueSlug
let Recipe: typeof import('../../lib/recipes/model').Recipe

async function seedSlugs(...slugs: string[]) {
  await Recipe.create(slugs.map((slug) => recipeDoc({ slug })))
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-slug-test')
  await (await import('../../lib/dbConnect.ts')).default()
  ;({ Recipe } = await import('../../lib/recipes/model'))
  ;({ uniqueSlug } = await import('../../lib/recipes/slug'))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

beforeEach(async () => {
  await Recipe.deleteMany({})
})

describe('uniqueSlug', () => {
  it('returns the slugified name when no recipe has it', async () => {
    expect(await uniqueSlug('Mac & Cheese')).toBe('mac-and-cheese')
  })

  it('appends -2 when the slug is taken', async () => {
    await seedSlugs('beef-stew')
    expect(await uniqueSlug('Beef Stew!')).toBe('beef-stew-2')
  })

  it('appends -3 when the slug and its -2 are taken', async () => {
    await seedSlugs('beef-stew', 'beef-stew-2')
    expect(await uniqueSlug('Beef Stew')).toBe('beef-stew-3')
  })

  it('counts slugs held by pending and rejected recipes', async () => {
    await Recipe.create([pendingDoc({ slug: 'beef-stew' }), rejectedDoc({ slug: 'beef-stew-2' })])
    expect(await uniqueSlug('Beef Stew')).toBe('beef-stew-3')
  })

  it('returns the bare slug when only longer slugs starting with it are taken', async () => {
    await seedSlugs('beef-stew-2', 'beef-stew-pie')
    expect(await uniqueSlug('Beef Stew')).toBe('beef-stew')
  })

  it('throws for a name with nothing to slug', async () => {
    await expect(uniqueSlug('🍰🍰')).rejects.toThrow()
  })
})
