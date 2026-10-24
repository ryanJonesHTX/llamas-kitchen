import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { disconnect, reseed } from './db.ts'
import { hiddenRecipes, seedRecipe, seedRecipes } from './fixtures.ts'

// Old recipe URLs were /<ObjectId>. They redirect permanently (308) to the
// slug URL for published recipes. Every other single-segment URL is 404 with
// the not-found page.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

async function expectNotFound(page: Page, path: string) {
  const response = await page.goto(path)

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
}

test('/<id> of a published recipe redirects 308 to /recipes/<slug>', async ({ page, baseURL }) => {
  const stew = seedRecipe('E2E Beef Stew')

  const response = await page.request.get(`/${stew._id}`, { maxRedirects: 0 })

  expect(response.status()).toBe(308)
  expect(new URL(response.headers()['location'], baseURL).pathname).toBe(`/recipes/${stew.slug}`)
  await page.goto(`/${stew._id}`)
  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: stew.name })).toBeVisible()
})

// Bots probe paths like /index.php, which land on the old /<id> route.
test('a URL that is not a valid id responds 404 with the not-found page', async ({ page }) => {
  await expectNotFound(page, '/index.php')
})

test('an unknown single-segment URL responds 404 with the not-found page', async ({ page }) => {
  await expectNotFound(page, '/no-such-page')
})

test('a valid id with no matching recipe responds 404 with the not-found page', async ({ page }) => {
  const missingId = '65a0000000000000000000ff'
  expect(seedRecipes.map((r) => r._id)).not.toContain(missingId)

  await expectNotFound(page, `/${missingId}`)
})

// Checked without following redirects too: a redirect to the hidden recipe's
// slug would also end on a 404.
for (const hidden of hiddenRecipes) {
  test(`the id of a ${hidden.status} recipe responds 404 with the not-found page`, async ({ page }) => {
    const response = await page.request.get(`/${hidden._id}`, { maxRedirects: 0 })

    expect(response.status()).toBe(404)
    await expectNotFound(page, `/${hidden._id}`)
  })
}
