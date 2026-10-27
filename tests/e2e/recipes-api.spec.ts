import type { APIRequestContext } from '@playwright/test'
import { RECIPE_PAGE_SIZE } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { hiddenRecipes, seedRecipe, type SeedRecipe } from './fixtures.ts'

// GET /api/recipes: the /recipes listing's pages as JSON, for the client grid.
// Requests without X-Forwarded-For share one rate-limit key, so each request
// sends its own address.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

type CardData = { id: string; name: string; slug: string; prepTime: number; cookTime: number; tags: string[]; imageUrl: string | null }
type ListingBody = { recipes: CardData[]; nextCursor: string | null }

let ipCount = 0
const freshIp = () => `203.0.113.${++ipCount}`

function getListing(request: APIRequestContext, query: string) {
  return request.get(`/api/recipes${query}`, { headers: { 'x-forwarded-for': freshIp() } })
}

async function listingNames(request: APIRequestContext, query: string): Promise<{ names: string[]; nextCursor: string | null }> {
  const response = await getListing(request, query)
  expect(response.status(), query).toBe(200)
  const body = (await response.json()) as ListingBody
  return { names: body.recipes.map((recipe) => recipe.name), nextCursor: body.nextCursor }
}

// By publishedAt, as on /recipes.
const newestFirst = [
  'E2E Pork Chops',
  'E2E Chicken Curry',
  'E2E Beef Burgers',
  'E2E Chicken Tacos',
  'E2E Beef Stew',
]

// The same paging set as recipe-list.spec.ts: RECIPE_PAGE_SIZE + 3 recipes
// published at one instant before every seed, so pages split inside a tie on
// publishedAt and the order within it comes from _id alone.
const PAGING_COUNT = RECIPE_PAGE_SIZE + 3
const pagingName = (n: number) => `E2E Paging ${String(n).padStart(2, '0')}`
const range = (from: number, to: number) => {
  const step = from <= to ? 1 : -1
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + i * step)
}

function pagingRecipes(): SeedRecipe[] {
  const template = seedRecipe('E2E Chicken Tacos')
  return range(1, PAGING_COUNT).map((n) => ({
    ...template,
    _id: `65b${n.toString(16).padStart(21, '0')}`,
    name: pagingName(n),
    slug: `e2e-paging-${n}`,
    imagePublicId: `recipes/e2e-paging-${n}`,
    tags: ['paging'],
    prepTime: 10,
    cookTime: 10,
    publishedAt: new Date('2023-06-01T12:00:00Z'),
    createdAt: new Date('2023-06-01T12:00:00Z'),
  }))
}

test.describe('recipes API', () => {
  test('returns the published recipes as card data, never a hidden one', async ({ request }) => {
    const response = await getListing(request, '')

    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    const body = (await response.json()) as ListingBody
    expect(body.recipes.map((recipe) => recipe.name)).toEqual(newestFirst)
    expect(body.nextCursor).toBeNull()

    const stew = seedRecipe('E2E Beef Stew')
    expect(body.recipes.at(-1)).toStrictEqual({
      id: stew._id,
      name: stew.name,
      slug: stew.slug,
      prepTime: stew.prepTime,
      cookTime: stew.cookTime,
      tags: stew.tags,
      imageUrl: expect.stringMatching(new RegExp(`^https://res\\.cloudinary\\.com/e2e-cloud/image/upload/.+/${stew.imagePublicId}$`)),
    })
    for (const hidden of hiddenRecipes) expect(body.recipes.map((recipe) => recipe.name)).not.toContain(hidden.name)
  })

  test('following nextCursor gives the same pages as "More recipes"', async ({ request }) => {
    await insertRecipes(pagingRecipes())
    const firstPagePaging = RECIPE_PAGE_SIZE - newestFirst.length

    const first = await listingNames(request, '')
    expect(first.names).toEqual([...newestFirst, ...range(PAGING_COUNT, PAGING_COUNT - firstPagePaging + 1).map(pagingName)])
    expect(first.nextCursor).not.toBeNull()

    const second = await listingNames(request, `?after=${first.nextCursor}`)
    expect(second.names).toEqual(range(PAGING_COUNT - firstPagePaging, 1).map(pagingName))
    expect(second.nextCursor).toBeNull()
  })

  test('keeps the filters, sort and search across pages', async ({ request }) => {
    await insertRecipes(pagingRecipes())

    const filtered = await listingNames(request, '?tag=paging&time=quick&sort=oldest')
    expect(filtered.names).toEqual(range(1, RECIPE_PAGE_SIZE).map(pagingName))
    const filteredRest = await listingNames(request, `?tag=paging&time=quick&sort=oldest&after=${filtered.nextCursor}`)
    expect(filteredRest).toEqual({ names: range(RECIPE_PAGE_SIZE + 1, PAGING_COUNT).map(pagingName), nextCursor: null })

    const searched = await listingNames(request, '?q=e2e+paging')
    expect(searched.names).toEqual(range(PAGING_COUNT, PAGING_COUNT - RECIPE_PAGE_SIZE + 1).map(pagingName))
    const searchedRest = await listingNames(request, `?q=e2e+paging&after=${searched.nextCursor}`)
    expect(searchedRest).toEqual({ names: range(PAGING_COUNT - RECIPE_PAGE_SIZE, 1).map(pagingName), nextCursor: null })
  })

  // The pending recipe is tagged beef; the rejected one is a chicken recipe.
  test('filters by tag and search words', async ({ request }) => {
    expect((await listingNames(request, '?tag=beef')).names).toEqual(['E2E Beef Burgers', 'E2E Beef Stew'])
    expect((await listingNames(request, '?tag=beef&tag=pork')).names).toEqual(['E2E Pork Chops', 'E2E Beef Burgers', 'E2E Beef Stew'])
    expect((await listingNames(request, '?q=chicken')).names).toEqual(['E2E Chicken Curry', 'E2E Chicken Tacos'])
  })

  test('answers 400 for a bad cursor', async ({ request }) => {
    const response = await getListing(request, '?after=not-a-cursor')

    expect(response.status()).toBe(400)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(await response.json()).toEqual({ error: 'Invalid listing' })
  })
})
