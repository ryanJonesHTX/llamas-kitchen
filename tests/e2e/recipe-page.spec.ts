import { expect, test } from './test.ts'
import { disconnect, reseed } from './db.ts'
import { hiddenRecipes, seedRecipe, seedRecipes } from './fixtures.ts'
import { ingredientItems, stepsList, tagItems } from './recipePage.ts'

// The public recipe page, /recipes/<slug>: published recipes only.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

test('a published recipe shows its name, description, ingredients, steps as an ordered list, tags, servings and credit', async ({
  page,
}) => {
  const stew = seedRecipe('E2E Beef Stew')

  const response = await page.goto(`/recipes/${stew.slug}`)

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: stew.name })).toBeVisible()
  await expect(page.getByText(stew.description)).toBeVisible()
  await expect(ingredientItems(page)).toHaveText(['2 lb stewing beef', '3 carrots', '4 cups beef stock'])
  await expect(stepsList(page)).toHaveJSProperty('tagName', 'OL')
  await expect(stepsList(page).getByRole('listitem')).toHaveText(stew.steps)
  await expect(tagItems(page)).toHaveText(stew.tags)
  await expect(page.getByText(`Serves ${stew.servings}`)).toBeVisible()
  await expect(page.getByText(stew.credit!)).toBeVisible()
})

test('a recipe with a sourceUrl links to it as "Source"', async ({ page }) => {
  const stew = seedRecipe('E2E Beef Stew')

  await page.goto(`/recipes/${stew.slug}`)

  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', stew.sourceUrl!)
})

test('a recipe without a sourceUrl has no Source link', async ({ page }) => {
  const tacos = seedRecipe('E2E Chicken Tacos')
  expect(tacos.sourceUrl).toBeUndefined()

  await page.goto(`/recipes/${tacos.slug}`)

  await expect(page.getByRole('heading', { level: 1, name: tacos.name })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
})

for (const hidden of hiddenRecipes) {
  test(`a ${hidden.status} recipe's slug responds 404`, async ({ page }) => {
    const response = await page.goto(`/recipes/${hidden.slug}`)

    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByText(hidden.name)).toHaveCount(0)
  })
}

test('an unknown slug responds 404', async ({ page }) => {
  const unknown = 'e2e-no-such-recipe'
  expect(seedRecipes.map((r) => r.slug)).not.toContain(unknown)

  const response = await page.goto(`/recipes/${unknown}`)

  expect(response?.status()).toBe(404)
})
