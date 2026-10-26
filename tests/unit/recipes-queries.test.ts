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

// Submitters in the Auth.js users collection. The third has no account.
const namedUser = new Types.ObjectId('64b0000000000000000000c1')
const unnamedUser = new Types.ObjectId('64b0000000000000000000c2')
const deletedUser = new Types.ObjectId('64b0000000000000000000c3')
const users = [
  { _id: namedUser, name: 'Pat Cook', email: 'pat@example.com', role: 'user' },
  { _id: unnamedUser, name: null, email: 'sam@example.com', role: 'user' },
]

// Date Bars and Beef Stew share a publishedAt; Date Bars has the larger _id.
const fixtures = [
  recipeDoc({ _id: id(1), name: 'Apple Pie', slug: 'apple-pie', publishedAt: day(1), tags: ['dessert', 'baking'] }),
  recipeDoc({ _id: id(2), name: 'Beef Stew', slug: 'beef-stew', publishedAt: day(3), tags: ['main dish'] }),
  recipeDoc({ _id: id(3), name: 'Carrot Soup', slug: 'carrot-soup', publishedAt: day(2), tags: ['soup'] }),
  recipeDoc({ _id: id(4), name: 'Date Bars', slug: 'date-bars', publishedAt: day(3), tags: ['dessert'] }),
  pendingDoc({
    _id: id(5),
    name: 'Pending Pasta',
    slug: 'pending-pasta',
    description: 'Fresh pasta.',
    tags: ['secret-pending'],
    submittedBy: namedUser,
    createdAt: day(5),
    updatedAt: day(6),
  }),
  pendingDoc({ _id: id(7), name: 'Pending Pie', slug: 'pending-pie', submittedBy: unnamedUser, createdAt: day(2) }),
  pendingDoc({ _id: id(8), name: 'Pending Paella', slug: 'pending-paella', submittedBy: deletedUser, createdAt: day(9) }),
  rejectedDoc({ _id: id(6), name: 'Rejected Ramen', slug: 'rejected-ramen', tags: ['secret-rejected'] }),
  rejectedDoc({
    _id: new Types.ObjectId('66000000000000000000000a'),
    name: 'Rejected Risotto',
    slug: 'rejected-risotto',
    rejectionReason: 'Too salty.',
    submittedBy: namedUser,
    createdAt: day(7),
  }),
]

const hidden = [
  { status: 'pending', id: id(5), name: 'Pending Pasta', tag: 'secret-pending' },
  { status: 'rejected', id: id(6), name: 'Rejected Ramen', tag: 'secret-rejected' },
]

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-queries-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  // Without timestamps, so the queue fixtures keep their createdAt and updatedAt.
  await Recipe.insertMany(fixtures, { timestamps: false })
  await mongoose.connection.collection('users').insertMany(users)
  queries = await import('../../lib/recipes/queries')
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
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

  it('returns only the fields a recipe card needs', async () => {
    const [recipe] = await queries.latestPublished(1)
    expect(Object.keys(recipe).sort()).toEqual(
      ['_id', 'cookTime', 'name', 'prepTime', 'publishedAt', 'slug', 'tags'].sort()
    )
    expect(recipe).toMatchObject({ name: 'Date Bars', prepTime: 20, cookTime: 120, tags: ['dessert'] })
  })

  // Mongo reads limit(0) as no limit, so anything but a positive integer must fail fast.
  it.each([[0], [-1], [1.5]])('rejects n = %j', async (n) => {
    await expect(queries.latestPublished(n)).rejects.toThrow()
  })
})

describe('publishedTagsInUse', () => {
  it('returns each tag used by a published recipe once, sorted', async () => {
    expect(await queries.publishedTagsInUse()).toEqual(['baking', 'dessert', 'main dish', 'soup'])
  })
})

describe.each(hidden)('public queries hide a $status recipe', ({ id: hiddenId, name, tag }) => {
  it('getPublishedSlugById returns null for its id', async () => {
    expect(await queries.getPublishedSlugById(hiddenId.toHexString())).toBeNull()
  })

  it('latestPublished leaves it out', async () => {
    const recipes = await queries.latestPublished(10)
    expect(recipes.map((r) => r.name)).not.toContain(name)
  })

  it('publishedTagsInUse leaves out its tags', async () => {
    expect(await queries.publishedTagsInUse()).not.toContain(tag)
  })
})

describe('getRecipeBySlug', () => {
  it.each([
    ['published', 'apple-pie', 'Apple Pie'],
    ['pending', 'pending-pasta', 'Pending Pasta'],
    ['rejected', 'rejected-ramen', 'Rejected Ramen'],
  ])('returns a %s recipe by slug', async (status, slug, name) => {
    expect(await queries.getRecipeBySlug(slug)).toMatchObject({ name, slug, status })
  })

  it('returns the whole stored recipe', async () => {
    const recipe = await queries.getRecipeBySlug('beef-stew')
    expect(recipe).toMatchObject({ name: 'Beef Stew', slug: 'beef-stew', status: 'published' })
    expect(String(recipe!._id)).toBe(id(2).toHexString())
  })

  it('returns null for an unknown slug', async () => {
    expect(await queries.getRecipeBySlug('no-such-recipe')).toBeNull()
  })
})

describe('queueEntries', () => {
  it('returns only pending recipes, oldest createdAt first', async () => {
    const entries = await queries.queueEntries()
    expect(entries.map((entry) => entry.name)).toEqual(['Pending Pie', 'Pending Pasta', 'Pending Paella'])
  })

  it('returns the fields the queue shows, its updatedAt, and the submitter name, else email, else null', async () => {
    const [pie, pasta, paella] = await queries.queueEntries()
    expect(Object.keys(pasta).sort()).toEqual(['_id', 'createdAt', 'description', 'name', 'slug', 'submitter', 'updatedAt'])
    expect(pasta).toEqual({
      _id: id(5),
      name: 'Pending Pasta',
      slug: 'pending-pasta',
      description: 'Fresh pasta.',
      createdAt: day(5),
      updatedAt: day(6),
      submitter: 'Pat Cook',
    })
    expect(pie.submitter).toBe('sam@example.com')
    expect(paella.submitter).toBeNull()
  })
})

describe('submittedRecipes', () => {
  it("returns only the user's recipes, any status, newest createdAt first", async () => {
    const recipes = await queries.submittedRecipes(namedUser.toHexString())
    expect(recipes.map((recipe) => recipe.name)).toEqual(['Rejected Risotto', 'Pending Pasta'])
  })

  it('returns only the fields the page shows and canEdit reads', async () => {
    const [risotto, pasta] = await queries.submittedRecipes(namedUser.toHexString())
    expect(risotto).toEqual({
      name: 'Rejected Risotto',
      slug: 'rejected-risotto',
      status: 'rejected',
      rejectionReason: 'Too salty.',
      createdAt: day(7),
      submittedBy: namedUser,
    })
    expect(Object.keys(pasta).sort()).toEqual(['createdAt', 'name', 'slug', 'status', 'submittedBy'])
  })

  it('returns an empty list for a user with no recipes', async () => {
    expect(await queries.submittedRecipes('64b0000000000000000000c4')).toEqual([])
  })
})
