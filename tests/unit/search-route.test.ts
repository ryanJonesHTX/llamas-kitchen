import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS, SEARCH_RATE_LIMIT } from '../../lib/constants'
import { day, pendingDoc, recipeDoc } from '../fixtures/recipes'

// GET /api/search (app/api/search/route.ts) against an in-memory MongoDB.
// The route's rate limiter lives as long as the module, so each test uses
// its own client IP.

let mongo: MongoMemoryServer
let route: typeof import('../../app/api/search/route')

const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))

const fixtures = [
  recipeDoc({ _id: id(1), name: 'Chicken Curry', slug: 'chicken-curry', publishedAt: day(3), tags: ['chicken', 'curry', 'dinner', 'spicy'], imagePublicId: 'recipes/chicken-curry' }),
  recipeDoc({ _id: id(2), name: 'Chicken Tacos', slug: 'chicken-tacos', publishedAt: day(2), tags: ['chicken'] }),
  pendingDoc({ _id: id(3), name: 'Chicken Pending Pie', slug: 'chicken-pending-pie' }),
]

let ipCount = 0
const freshIp = () => `198.51.100.${++ipCount}`

function get(query: string, xff: string = freshIp()) {
  return route.GET(new Request(`http://localhost/api/search${query}`, { headers: { 'x-forwarded-for': xff } }))
}

beforeAll(async () => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('search-route-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  route = await import('../../app/api/search/route')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('GET /api/search', () => {
  it('returns the published matches with only name, slug, tags and a thumbnail URL or null', async () => {
    const response = await get('?q=chic')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      results: [
        {
          name: 'Chicken Curry',
          slug: 'chicken-curry',
          tags: ['chicken', 'curry', 'dinner', 'spicy'],
          imageUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_96,h_96,f_auto,q_auto/recipes/chicken-curry',
        },
        { name: 'Chicken Tacos', slug: 'chicken-tacos', tags: ['chicken'], imageUrl: null },
      ],
    })
  })

  it('keeps every response out of shared caches', async () => {
    for (const query of ['?q=chic', '?q=', `?q=${'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1)}`]) {
      expect((await get(query)).headers.get('cache-control')).toBe('private, no-store')
    }
  })

  it.each([[''], ['?q='], ['?q=%20%20'], ['?other=chicken']])('returns no results for a blank q: %j', async (query) => {
    const response = await get(query)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
  })

  it('returns no results for a q with no words', async () => {
    const response = await get('?q=!!!')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
  })

  it.each<[string, string]>([
    [`more than ${MAX_SEARCH_QUERY_LENGTH} characters`, `?q=${'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1)}`],
    [
      `more than ${MAX_SEARCH_WORDS} distinct words`,
      `?q=${Array.from({ length: MAX_SEARCH_WORDS + 1 }, (_, i) => `w${i}`).join('+')}`,
    ],
    ['q given twice', '?q=chicken&q=curry'],
    ['q given twice with the same value', '?q=chicken&q=chicken'],
  ])('answers 400 for %s', async (_label, query) => {
    expect((await get(query)).status).toBe(400)
  })

  it(`answers 429 with Retry-After after ${SEARCH_RATE_LIMIT} requests from one IP`, async () => {
    const ip = freshIp()
    for (let i = 0; i < SEARCH_RATE_LIMIT; i++) expect((await get('?q=', ip)).status).toBe(200)

    const limited = await get('?q=chic', ip)
    expect(limited.status).toBe(429)
    const retryAfter = Number(limited.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(60)
    expect(limited.headers.get('cache-control')).toBe('private, no-store')

    expect((await get('?q=chic')).status).toBe(200)
  })

  it('keys the limit on the last X-Forwarded-For entry, which the proxy appends', async () => {
    const ip = freshIp()
    for (let i = 0; i < SEARCH_RATE_LIMIT; i++) {
      expect((await get('?q=', `10.0.0.${i % 2}, ${ip}`)).status).toBe(200)
    }

    expect((await get('?q=', `10.9.9.9, ${ip}`)).status).toBe(429)
    expect((await get('?q=', ip)).status).toBe(429)
    expect((await get('?q=', `${ip}, ${freshIp()}`)).status).toBe(200)
  })
})
