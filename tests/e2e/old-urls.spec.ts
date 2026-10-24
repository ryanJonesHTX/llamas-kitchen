import { expect, test } from './test.ts'
import { disconnect, reseed } from './db.ts'
import { hiddenRecipes, seedRecipe, seedRecipes } from './fixtures.ts'

// Old recipe URLs were /<ObjectId>. They redirect permanently to the slug
// URL for published recipes, and are 404 otherwise.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

test('/<id> of a published recipe redirects 301 to /recipes/<slug>', async ({ page, baseURL }) => {
  const stew = seedRecipe('E2E Beef Stew')

  const response = await page.request.get(`/${stew._id}`, { maxRedirects: 0 })

  expect(response.status()).toBe(301)
  expect(new URL(response.headers()['location'], baseURL).pathname).toBe(`/recipes/${stew.slug}`)
  await page.goto(`/${stew._id}`)
  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: stew.name })).toBeVisible()
})

// Bots probe paths like /index.php, which land on the old /<id> route.
test('a URL that is not a valid id responds 404', async ({ page }) => {
  const response = await page.goto('/index.php')

  expect(response?.status()).toBe(404)
})

test('a valid id with no matching recipe responds 404', async ({ page }) => {
  const missingId = '65a0000000000000000000ff'
  expect(seedRecipes.map((r) => r._id)).not.toContain(missingId)

  const response = await page.goto(`/${missingId}`)

  expect(response?.status()).toBe(404)
})

for (const hidden of hiddenRecipes) {
  test(`the id of a ${hidden.status} recipe responds 404`, async ({ page }) => {
    const response = await page.request.get(`/${hidden._id}`, { maxRedirects: 0 })

    expect(response.status()).toBe(404)
  })
}
