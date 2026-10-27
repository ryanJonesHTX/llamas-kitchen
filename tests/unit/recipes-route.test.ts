import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { LISTING_RATE_LIMIT, RECIPE_PAGE_SIZE } from '../../lib/constants'
import { day, pendingDoc, recipeDoc } from '../fixtures/recipes'

// GET /api/recipes (app/api/recipes/route.ts) against an in-memory MongoDB.
// The route's rate limiter lives as long as the module, so each test uses
// its own client IP.

let mongo: MongoMemoryServer
let route: typeof import('../../app/api/recipes/route')
let listing: typeof import('../../lib/recipes/listing')

const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))
const fillerName = (n: number) => `Filler ${String(n).padStart(2, '0')}`

// RECIPE_PAGE_SIZE + 1 published recipes, so the full listing has two pages.
// Newest first: Chicken Curry, Beef Burgers, Pork Chops, then the fillers
// from the highest number down. The pending pie is tagged beef.
const FILLER_COUNT = RECIPE_PAGE_SIZE - 2
const fixtures = [
  recipeDoc({ _id: id(1), name: 'Chicken Curry', slug: 'chicken-curry', publishedAt: day(30), prepTime: 20, cookTime: 70, tags: ['chicken', 'curry'], imagePublicId: 'recipes/chicken-curry' }),
  recipeDoc({ _id: id(2), name: 'Beef Burgers', slug: 'beef-burgers', publishedAt: day(29), prepTime: 10, cookTime: 15, tags: ['beef'] }),
  recipeDoc({ _id: id(3), name: 'Pork Chops', slug: 'pork-chops', publishedAt: day(28), tags: ['pork'] }),
  ...Array.from({ length: FILLER_COUNT }, (_, i) =>
    recipeDoc({ _id: id(100 + i + 1), name: fillerName(i + 1), slug: `filler-${i + 1}`, publishedAt: day(i + 1), tags: ['filler'] })
  ),
  pendingDoc({ _id: id(4), name: 'Beef Pending Pie', slug: 'beef-pending-pie', tags: ['beef'] }),
]

let ipCount = 0
const freshIp = () => `198.51.100.${++ipCount}`

function get(query: string, xff: string = freshIp()) {
  return route.GET(new Request(`http://localhost/api/recipes${query}`, { headers: { 'x-forwarded-for': xff } }))
}

async function names(query: string): Promise<string[]> {
  const response = await get(query)
  expect(response.status).toBe(200)
  const body = (await response.json()) as { recipes: { name: string }[] }
  return body.recipes.map((recipe) => recipe.name)
}

beforeAll(async () => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-route-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  listing = await import('../../lib/recipes/listing')
  route = await import('../../app/api/recipes/route')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('GET /api/recipes', () => {
  it('returns the matching published recipes as card data, with a card image URL or null', async () => {
    const curry = await get('?tag=chicken')
    expect(curry.status).toBe(200)
    expect(await curry.json()).toEqual({
      recipes: [
        {
          id: id(1).toHexString(),
          name: 'Chicken Curry',
          slug: 'chicken-curry',
          prepTime: 20,
          cookTime: 70,
          tags: ['chicken', 'curry'],
          imageUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_800,h_600,f_auto,q_auto/recipes/chicken-curry',
        },
      ],
      nextCursor: null,
    })

    // The pending pie is tagged beef too.
    const burgers = await get('?tag=beef')
    expect(await burgers.json()).toEqual({
      recipes: [
        { id: id(2).toHexString(), name: 'Beef Burgers', slug: 'beef-burgers', prepTime: 10, cookTime: 15, tags: ['beef'], imageUrl: null },
      ],
      nextCursor: null,
    })
  })

  it('returns a page of RECIPE_PAGE_SIZE with the same nextCursor as listPublished, and following it gives the rest', async () => {
    const response = await get('')
    expect(response.status).toBe(200)
    const first = (await response.json()) as { recipes: { name: string }[]; nextCursor: string | null }
    const expected = await listing.listPublished(listing.parseListingParams({})!)

    expect(first.recipes.map((recipe) => recipe.name)).toEqual(expected.recipes.map((recipe) => recipe.name))
    expect(first.recipes).toHaveLength(RECIPE_PAGE_SIZE)
    expect(first.recipes.slice(0, 3).map((recipe) => recipe.name)).toEqual(['Chicken Curry', 'Beef Burgers', 'Pork Chops'])
    expect(first.nextCursor).toBe(expected.nextCursor)
    expect(first.nextCursor).toEqual(expect.any(String))

    const rest = await get(`?after=${first.nextCursor}`)
    expect(await rest.json()).toEqual({
      recipes: [expect.objectContaining({ name: fillerName(1) })],
      nextCursor: null,
    })
  })

  it('applies the sort with the cursor', async () => {
    const first = (await (await get('?sort=oldest')).json()) as { recipes: { name: string }[]; nextCursor: string }
    expect(first.recipes[0].name).toBe(fillerName(1))
    expect(await names(`?sort=oldest&after=${first.nextCursor}`)).toEqual(['Chicken Curry'])
  })

  it('accepts a repeated tag as several tags, matching any of them', async () => {
    expect(await names('?tag=beef&tag=pork')).toEqual(['Beef Burgers', 'Pork Chops'])
  })

  it('filters by search words and total time', async () => {
    expect(await names('?q=curry')).toEqual(['Chicken Curry'])
    expect(await names('?time=long&tag=chicken&tag=beef')).toEqual(['Chicken Curry'])
  })

  it('ignores unknown params', async () => {
    expect(await names('?tag=pork&page=2&foo=bar&foo=baz')).toEqual(['Pork Chops'])
  })

  it.each<[string, string]>([
    ['a malformed cursor', '?after=not-a-cursor'],
    ['an empty cursor', '?after='],
    ['an unknown sort', '?sort=popular'],
    ['an unknown time', '?time=forever'],
    ['sort given twice', '?sort=newest&sort=oldest'],
    ['q given twice', '?q=chicken&q=curry'],
    ['after given twice', '?after=a&after=b'],
    ['a duplicate tag', '?tag=beef&tag=beef'],
  ])('answers 400 for %s', async (_label, query) => {
    const response = await get(query)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid listing' })
  })

  it('keeps every response out of shared caches', async () => {
    for (const query of ['', '?tag=beef', '?sort=popular', '?after=not-a-cursor']) {
      expect((await get(query)).headers.get('cache-control')).toBe('private, no-store')
    }
  })

  it(`answers 429 with Retry-After after ${LISTING_RATE_LIMIT} requests from one IP, other IPs unaffected`, async () => {
    const ip = freshIp()
    // A query with no search words answers without reading the database.
    for (let i = 0; i < LISTING_RATE_LIMIT; i++) expect((await get('?q=!!!', ip)).status).toBe(200)

    const limited = await get('?tag=beef', ip)
    expect(limited.status).toBe(429)
    const retryAfter = Number(limited.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(60)
    expect(limited.headers.get('cache-control')).toBe('private, no-store')

    expect((await get('?tag=beef')).status).toBe(200)
  })
})
