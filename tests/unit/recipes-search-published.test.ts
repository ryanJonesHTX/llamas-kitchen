import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { day, pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'

// searchPublished, the search dialog's ranked top results, against an
// in-memory MongoDB. The fixtures are seeded once; every test only reads.

let mongo: MongoMemoryServer
let queries: typeof import('../../lib/recipes/queries')

const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))
const items = (...names: string[]) => names.map((item) => ({ quantity: 1, unit: null, item }))

// Fish Tacos is the newest "lemon" recipe, but lemon is only an ingredient.
const fixtures = [
  recipeDoc({ _id: id(1), name: 'Lemon Chicken', slug: 'lemon-chicken', publishedAt: day(5), ingredients: items('chicken breast', 'lemon'), tags: ['dinner'], imagePublicId: 'recipes/lemon-chicken' }),
  recipeDoc({ _id: id(2), name: 'Lemon Tart', slug: 'lemon-tart', publishedAt: day(2), ingredients: items('flour', 'lemon'), tags: ['dessert'] }),
  recipeDoc({ _id: id(3), name: 'Fish Tacos', slug: 'fish-tacos', publishedAt: day(9), ingredients: items('lemon juice', 'fish'), tags: ['dinner'] }),
  recipeDoc({ _id: id(4), name: 'Iced Tea', slug: 'iced-tea', publishedAt: day(4), ingredients: items('tea', 'sugar'), tags: ['lemon'] }),
  recipeDoc({ _id: id(5), name: 'Lemon Rice', slug: 'lemon-rice', publishedAt: day(8), ingredients: items('rice', 'chicken stock'), tags: ['side'] }),
  pendingDoc({ _id: id(6), name: 'Lemon Pending Pie', slug: 'lemon-pending-pie', createdAt: day(10) }),
  rejectedDoc({ _id: id(7), name: 'Lemon Rejected Cake', slug: 'lemon-rejected-cake', createdAt: day(10) }),
  recipeDoc({ _id: id(8), name: 'Crème Brûlée', slug: 'creme-brulee', publishedAt: day(6), ingredients: items('cream', 'sugar'), tags: ['dessert'] }),
  recipeDoc({ _id: id(9), name: 'Berry Parfait', slug: 'berry-parfait', publishedAt: day(1), ingredients: items('crème fraîche', 'berries'), tags: ['dessert'] }),
]

const names = async (words: string[], limit = 8) => (await queries.searchPublished(words, limit)).map((hit) => hit.name)

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-search-published-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  queries = await import('../../lib/recipes/queries')
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('searchPublished', () => {
  it('lists recipes with every word in the name first, then the rest, each newest first', async () => {
    expect(await names(['lemon'])).toEqual(['Lemon Rice', 'Lemon Chicken', 'Lemon Tart', 'Fish Tacos', 'Iced Tea'])
  })

  it('puts a recipe in the name group only when every word is in its name', async () => {
    // Lemon Rice has "chicken" only in an ingredient.
    expect(await names(['lemon', 'chicken'])).toEqual(['Lemon Chicken', 'Lemon Rice'])
    expect(await names(['lem', 'chic'])).toEqual(['Lemon Chicken', 'Lemon Rice'])
  })

  it('ignores accents, keeping the name group first', async () => {
    // Berry Parfait is newer but has "crème" only in an ingredient.
    expect(await names(['creme'])).toEqual(['Crème Brûlée', 'Berry Parfait'])
    expect(await names(['brulee'])).toEqual(['Crème Brûlée'])
  })

  it('returns at most limit recipes, filling from the second group', async () => {
    expect(await names(['lemon'], 2)).toEqual(['Lemon Rice', 'Lemon Chicken'])
    expect(await names(['lemon'], 4)).toEqual(['Lemon Rice', 'Lemon Chicken', 'Lemon Tart', 'Fish Tacos'])
  })

  it('never returns pending or rejected recipes', async () => {
    for (const words of [['lemon'], ['pending'], ['rejected'], ['cake'], ['pie']]) {
      const found = await names(words)
      expect(found).not.toContain('Lemon Pending Pie')
      expect(found).not.toContain('Lemon Rejected Cake')
    }
  })

  it('returns only the name, slug, tags and image', async () => {
    const [chicken] = await queries.searchPublished(['chicken', 'breast'], 8)
    const [tart] = await queries.searchPublished(['tart'], 8)
    expect(chicken).toEqual({ name: 'Lemon Chicken', slug: 'lemon-chicken', tags: ['dinner'], imagePublicId: 'recipes/lemon-chicken' })
    expect(tart).toEqual({ name: 'Lemon Tart', slug: 'lemon-tart', tags: ['dessert'] })
  })

  it('needs at least one search word', async () => {
    await expect(queries.searchPublished([], 8)).rejects.toThrow()
  })

  // Mongo reads limit(0) as no limit, so anything but a positive integer must fail fast.
  it.each([[0], [-1], [1.5]])('rejects limit = %j', async (limit) => {
    await expect(queries.searchPublished(['lemon'], limit)).rejects.toThrow()
  })
})
