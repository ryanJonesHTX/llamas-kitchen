import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { day, pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'

// The lib/recipes read queries against an in-memory MongoDB. Each query
// connects through lib/dbConnect, so MONGODB_URI is set before importing them.
// The fixtures are seeded once; every test only reads.

let mongo: MongoMemoryServer
let queries: typeof import('../../lib/recipes/queries')

const id = (n: number) => new Types.ObjectId(`66000000000000000000000${n}`)

// Date Bars and Beef Stew share a publishedAt; Date Bars has the larger _id.
const fixtures = [
  recipeDoc({ _id: id(1), name: 'Apple Pie', slug: 'apple-pie', publishedAt: day(1), tags: ['dessert', 'baking'] }),
  recipeDoc({ _id: id(2), name: 'Beef Stew', slug: 'beef-stew', publishedAt: day(3), tags: ['main dish'] }),
  recipeDoc({ _id: id(3), name: 'Carrot Soup', slug: 'carrot-soup', publishedAt: day(2), tags: ['soup'] }),
  recipeDoc({ _id: id(4), name: 'Date Bars', slug: 'date-bars', publishedAt: day(3), tags: ['dessert'] }),
  pendingDoc({ _id: id(5), name: 'Pending Pasta', slug: 'pending-pasta', tags: ['secret-pending'] }),
  rejectedDoc({ _id: id(6), name: 'Rejected Ramen', slug: 'rejected-ramen', tags: ['secret-rejected'] }),
]

const hidden = [
  { status: 'pending', id: id(5), slug: 'pending-pasta', name: 'Pending Pasta', tag: 'secret-pending' },
  { status: 'rejected', id: id(6), slug: 'rejected-ramen', name: 'Rejected Ramen', tag: 'secret-rejected' },
]

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-queries-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  queries = await import('../../lib/recipes/queries')
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('getPublishedBySlug', () => {
  it('returns the published recipe with that slug', async () => {
    const recipe = await queries.getPublishedBySlug('beef-stew')
    expect(recipe).toMatchObject({ name: 'Beef Stew', slug: 'beef-stew', status: 'published' })
    expect(String(recipe!._id)).toBe(id(2).toHexString())
  })

  it('returns null for an unknown slug', async () => {
    expect(await queries.getPublishedBySlug('no-such-recipe')).toBeNull()
  })
})

describe('getPublishedSlugById', () => {
  it('returns the slug of a published recipe from its id string', async () => {
    expect(await queries.getPublishedSlugById(id(3).toHexString())).toBe('carrot-soup')
  })

  it('returns null for an id with no recipe', async () => {
    expect(await queries.getPublishedSlugById(id(9).toHexString())).toBeNull()
  })

  it('returns null for a string that is not an ObjectId', async () => {
    expect(await queries.getPublishedSlugById('not-an-id')).toBeNull()
  })
})

describe('latestPublished', () => {
  it('returns published recipes newest publishedAt first, breaking ties by _id descending', async () => {
    const recipes = await queries.latestPublished(10)
    expect(recipes.map((r) => r.name)).toEqual(['Date Bars', 'Beef Stew', 'Carrot Soup', 'Apple Pie'])
  })

  it('returns at most n recipes', async () => {
    const recipes = await queries.latestPublished(2)
    expect(recipes.map((r) => r.name)).toEqual(['Date Bars', 'Beef Stew'])
  })

  // Mongo reads limit(0) as no limit, so anything but a positive integer must fail fast.
  it.each([[0], [-1], [1.5]])('rejects n = %j', async (n) => {
    await expect(queries.latestPublished(n)).rejects.toThrow()
  })
})

describe('allPublished', () => {
  it('returns every published recipe newest publishedAt first, breaking ties by _id descending', async () => {
    const recipes = await queries.allPublished()
    expect(recipes.map((r) => r.name)).toEqual(['Date Bars', 'Beef Stew', 'Carrot Soup', 'Apple Pie'])
  })
})

describe('publishedSearchOptions', () => {
  it('returns only a name and a /recipes/<slug> href for each published recipe', async () => {
    const options = await queries.publishedSearchOptions()
    const byName = [...options].sort((a, b) => a.name.localeCompare(b.name))
    expect(byName).toEqual([
      { name: 'Apple Pie', href: '/recipes/apple-pie' },
      { name: 'Beef Stew', href: '/recipes/beef-stew' },
      { name: 'Carrot Soup', href: '/recipes/carrot-soup' },
      { name: 'Date Bars', href: '/recipes/date-bars' },
    ])
  })
})

describe('publishedTagsInUse', () => {
  it('returns each tag used by a published recipe once, sorted', async () => {
    expect(await queries.publishedTagsInUse()).toEqual(['baking', 'dessert', 'main dish', 'soup'])
  })
})

describe.each(hidden)('public queries hide a $status recipe', ({ id: hiddenId, slug, name, tag }) => {
  it('getPublishedBySlug returns null for its slug', async () => {
    expect(await queries.getPublishedBySlug(slug)).toBeNull()
  })

  it('getPublishedSlugById returns null for its id', async () => {
    expect(await queries.getPublishedSlugById(hiddenId.toHexString())).toBeNull()
  })

  it('latestPublished leaves it out', async () => {
    const recipes = await queries.latestPublished(10)
    expect(recipes.map((r) => r.name)).not.toContain(name)
  })

  it('allPublished leaves it out', async () => {
    const recipes = await queries.allPublished()
    expect(recipes.map((r) => r.name)).not.toContain(name)
  })

  it('publishedSearchOptions leaves it out', async () => {
    const options = await queries.publishedSearchOptions()
    expect(options.map((o) => o.name)).not.toContain(name)
  })

  it('publishedTagsInUse leaves out its tags', async () => {
    expect(await queries.publishedTagsInUse()).not.toContain(tag)
  })
})

describe('getRecipeForEdit', () => {
  it.each([
    ['published', 'apple-pie', 'Apple Pie'],
    ['pending', 'pending-pasta', 'Pending Pasta'],
    ['rejected', 'rejected-ramen', 'Rejected Ramen'],
  ])('returns a %s recipe by slug', async (status, slug, name) => {
    expect(await queries.getRecipeForEdit(slug)).toMatchObject({ name, slug, status })
  })

  it('returns null for an unknown slug', async () => {
    expect(await queries.getRecipeForEdit('no-such-recipe')).toBeNull()
  })
})
