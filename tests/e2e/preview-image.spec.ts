import type { APIResponse } from '@playwright/test'
import { expect, test } from './test.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { pendingRecipe, seedRecipe, type SeedRecipe } from './fixtures.ts'
import { pngSize } from '../fixtures/png.ts'

// The generated link-preview images, fetched from the real server: the site's
// /preview-image and a published recipe's /recipes/<slug>/preview-image.
// The recipe route limits requests per client IP, so each request sends its
// own address.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

let ipCount = 0
const freshIp = () => `203.0.113.${++ipCount}`
const withFreshIp = () => ({ headers: { 'x-forwarded-for': freshIp() } })

// A copy of a seed recipe with no photo, as in metadata.spec.ts.
const noPhoto: SeedRecipe = {
  ...seedRecipe('E2E Chicken Tacos'),
  imagePublicId: undefined,
  _id: '65e000000000000000000001',
  name: 'E2E Photoless Tacos',
  slug: 'e2e-photoless-tacos',
  description: 'Tacos with no picture.',
}

async function expectPreviewPng(response: APIResponse) {
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  expect(pngSize(await response.body())).toEqual({ width: 1200, height: 630 })
}

test('the site preview image is a 1200x630 PNG that shared caches keep for a day', async ({ request }) => {
  const response = await request.get('/preview-image')
  await expectPreviewPng(response)
  expect(response.headers()['cache-control']).toBe('public, max-age=86400')
})

test("a published recipe without a photo links a preview image that is a 1200x630 PNG", async ({ page, request }) => {
  await insertRecipes([noPhoto])
  await page.goto(`/recipes/${noPhoto.slug}`)

  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(imageUrl).toMatch(new RegExp(`/recipes/${noPhoto.slug}/preview-image$`))

  await expectPreviewPng(await request.get(imageUrl!, withFreshIp()))
})

test("a pending recipe's preview image is the same 404 as a missing recipe's", async ({ request }) => {
  const pending = await request.get(`/recipes/${pendingRecipe.slug}/preview-image`, withFreshIp())
  const missing = await request.get('/recipes/e2e-no-such-recipe/preview-image', withFreshIp())

  expect(missing.status()).toBe(404)
  expect(pending.status()).toBe(404)
  expect(pending.headers()['content-type']).toBe(missing.headers()['content-type'])
  expect(pending.headers()['cache-control']).toBe(missing.headers()['cache-control'])
  expect((await pending.body()).equals(await missing.body())).toBe(true)
})
