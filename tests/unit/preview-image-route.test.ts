import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MAX_RECIPE_NAME_LENGTH, PREVIEW_IMAGE_RATE_LIMIT } from '../../lib/constants'
import { pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'
import { pngSize } from '../fixtures/png'

// The generated link-preview images: GET /recipes/[slug]/preview-image
// (against an in-memory MongoDB) and the static GET /preview-image. The
// recipe route's rate limiter lives as long as the module, so each test uses
// its own client IP. Rendering must never touch the network: fetch throws for
// the whole suite, except for the data: URLs next/og loads its WebAssembly from.

let mongo: MongoMemoryServer
let recipeRoute: typeof import('../../app/recipes/[slug]/preview-image/route')
let siteRoute: typeof import('../../app/preview-image/route')

// Words, so the card has to wrap it; ends in a letter, so the model's trim keeps every character.
const LONG_NAME = 'Slow roasted lamb shoulder with garlic and rosemary '.repeat(3).slice(0, MAX_RECIPE_NAME_LENGTH - 1) + 's'

// Names with characters the card's fonts can't draw, which next/og would
// otherwise fetch a font or emoji image for while streaming the response.
const UNDRAWABLE_NAMES = [
  ['polish-letters', 'Pierogi z Łodzi'],
  ['emoji', 'Tacos 🌮🔥'],
  ['hebrew', 'שקשוקה Shakshuka'],
  ['control-character', 'Beef\u0007Stew'],
  ['all-emoji', '🍕🍕🍕'],
] as const

const fixtures = [
  recipeDoc({ name: 'Beef Stew', slug: 'beef-stew' }),
  recipeDoc({ name: 'Chicken Curry', slug: 'chicken-curry', imagePublicId: 'recipes/chicken-curry' }),
  recipeDoc({ name: LONG_NAME, slug: 'long-name' }),
  pendingDoc({ name: 'Pending Pie', slug: 'pending-pie' }),
  rejectedDoc({ name: 'Rejected Bake', slug: 'rejected-bake' }),
  ...UNDRAWABLE_NAMES.map(([slug, name]) => recipeDoc({ name, slug })),
]

const realFetch = globalThis.fetch
const networkFetches: string[] = []

let ipCount = 0
const freshIp = () => `198.51.100.${++ipCount}`

function get(slug: string, xff: string = freshIp()) {
  return recipeRoute.GET(
    new Request(`http://localhost/recipes/${slug}/preview-image`, { headers: { 'x-forwarded-for': xff } }),
    { params: Promise.resolve({ slug }) }
  )
}

// A whole PNG ends with its IEND chunk: the type, then a 4-byte checksum.
async function expectPreviewPng(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  const bytes = new Uint8Array(await response.arrayBuffer())
  expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
  expect(String.fromCharCode(...bytes.slice(-8, -4))).toBe('IEND')
  expect(networkFetches).toEqual([])
}

beforeAll(async () => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('data:')) return realFetch(input, init)
    networkFetches.push(url)
    throw new Error(`Unexpected network fetch: ${url}`)
  })
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('preview-image-route-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  recipeRoute = await import('../../app/recipes/[slug]/preview-image/route')
  siteRoute = await import('../../app/preview-image/route')
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('GET /recipes/[slug]/preview-image', () => {
  it('returns a 1200x630 PNG for a published recipe without a photo', async () => {
    await expectPreviewPng(await get('beef-stew'))
  })

  it('returns a 1200x630 PNG for a published recipe with a photo too', async () => {
    await expectPreviewPng(await get('chicken-curry'))
  })

  it('lets shared caches keep a published recipe\'s image for an hour', async () => {
    expect((await get('beef-stew')).headers.get('cache-control')).toBe('public, max-age=3600')
  })

  it(`still returns a valid 1200x630 PNG for a ${MAX_RECIPE_NAME_LENGTH}-character name`, async () => {
    expect(LONG_NAME).toHaveLength(MAX_RECIPE_NAME_LENGTH)
    await expectPreviewPng(await get('long-name'))
  })

  it.each(UNDRAWABLE_NAMES)('returns a full 1200x630 PNG, without fetching, for a name like %s', async (slug) => {
    await expectPreviewPng(await get(slug))
  })

  it('answers pending, rejected and missing slugs with the same uncacheable 404', async () => {
    const answers = await Promise.all(
      ['pending-pie', 'rejected-bake', 'no-such-recipe'].map(async (slug) => {
        const response = await get(slug)
        return {
          slug,
          status: response.status,
          contentType: response.headers.get('content-type'),
          cacheControl: response.headers.get('cache-control'),
          body: Buffer.from(await response.arrayBuffer()).toString('base64'),
        }
      })
    )

    const [missing] = answers.slice(-1)
    expect(missing.status).toBe(404)
    expect(missing.cacheControl).toBe('private, no-store')
    for (const answer of answers) {
      expect({ ...answer, slug: missing.slug }, answer.slug).toEqual(missing)
    }
  })

  it(`answers 429 with Retry-After after ${PREVIEW_IMAGE_RATE_LIMIT} requests from one IP, other IPs unaffected`, async () => {
    const ip = freshIp()
    for (let i = 0; i < PREVIEW_IMAGE_RATE_LIMIT; i++) expect((await get('beef-stew', ip)).status).toBe(200)

    const limited = await get('beef-stew', ip)
    expect(limited.status).toBe(429)
    const retryAfter = Number(limited.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(60)
    expect(limited.headers.get('cache-control')).toBe('private, no-store')

    expect((await get('beef-stew')).status).toBe(200)
  })
})

describe('GET /preview-image', () => {
  it('returns the site\'s 1200x630 PNG with a public cache header', async () => {
    const response = await siteRoute.GET()
    await expectPreviewPng(response)
    const cacheControl = response.headers.get('cache-control') ?? ''
    expect(cacheControl).toMatch(/^public\b/)
    expect(Number(/max-age=(\d+)/.exec(cacheControl)?.[1])).toBeGreaterThan(0)
  })
})
