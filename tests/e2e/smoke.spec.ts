import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { disconnect, reseed } from './db.ts'
import { hiddenRecipes, publishedRecipes } from './fixtures.ts'

// The home page and the recipe list, which show published recipes only.
// Every test starts from exactly the seed fixtures.
test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

// On the home page the recipe cards are the only level-3 headings.
const latestRecipeNames = (page: Page) =>
  page.getByRole('heading', { level: 3 })

// The recipe grid is a <section aria-labelledby="recipes-heading">.
const recipeGridNames = (page: Page) =>
  page
    .getByRole('region', { name: 'Recipes', exact: true })
    .getByRole('heading', { level: 3 })

// By publishedAt. The pending and rejected recipes were created after all of
// these, so sorting by createdAt or skipping the status filter shows them.
const newestFirst = [
  'E2E Pork Chops',
  'E2E Chicken Curry',
  'E2E Beef Burgers',
  'E2E Chicken Tacos',
  'E2E Beef Stew',
]

const search = (page: Page) => page.getByRole('combobox', { name: 'Search Recipes' })

// Recipe links go to /recipes/<slug>.
async function expectSlugLinks(page: Page, names: string[]) {
  for (const name of names) {
    const { slug } = publishedRecipes.find((r) => r.name === name)!
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/recipes/${slug}`)
  }
}

test.describe('home page', () => {
  test('shows the heading and the four newest published recipes, newest first', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: "Llama's Kitchen" })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Latest Recipes' })
    ).toBeVisible()
    await expect(latestRecipeNames(page)).toHaveText(newestFirst.slice(0, 4))
  })

  test('shows only seeded data from the in-memory database', async ({
    page,
  }) => {
    await page.goto('/')

    const names = await latestRecipeNames(page).allTextContents()
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toMatch(/^E2E /)
    }
  })

  test('links each recipe to /recipes/<slug>', async ({ page }) => {
    await page.goto('/')

    await expectSlugLinks(page, newestFirst.slice(0, 4))
  })
})

test.describe('recipe list', () => {
  test('shows every published recipe, newest first by default', async ({ page }) => {
    await page.goto('/recipes')

    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })

  test('links each recipe to /recipes/<slug>', async ({ page }) => {
    await page.goto('/recipes')

    await expectSlugLinks(page, newestFirst)
  })

  // The pending recipe is tagged beef too.
  test('filters by tag', async ({ page }) => {
    await page.goto('/recipes')

    await page.getByRole('button', { name: '0 Filters' }).click()
    await page.getByRole('checkbox', { name: 'beef' }).check()

    await expect(recipeGridNames(page)).toHaveText([
      'E2E Beef Burgers',
      'E2E Beef Stew',
    ])
  })

  test('filters by total time', async ({ page }) => {
    await page.goto('/recipes')
    await page.getByRole('button', { name: '0 Filters' }).click()

    await page.getByRole('radio', { name: 'Total Time: > 1 Hour' }).check()
    await expect(recipeGridNames(page)).toHaveText([
      'E2E Chicken Curry',
      'E2E Beef Stew',
    ])

    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).check()
    await expect(recipeGridNames(page)).toHaveText([
      'E2E Pork Chops',
      'E2E Beef Burgers',
      'E2E Chicken Tacos',
    ])
  })

  test('"Clear all" restores the full list', async ({ page }) => {
    await page.goto('/recipes')
    await page.getByRole('button', { name: '0 Filters' }).click()
    await page.getByRole('checkbox', { name: 'chicken' }).check()
    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).check()
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos'])

    await page.getByRole('button', { name: 'Clear all' }).click()

    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(page.getByRole('checkbox', { name: 'chicken' })).not.toBeChecked()
  })

  test('sorts by oldest and newest', async ({ page }) => {
    await page.goto('/recipes')

    await page.getByRole('button', { name: 'Sort' }).click()
    await page.getByRole('menuitem', { name: 'Oldest' }).click()
    await expect(recipeGridNames(page)).toHaveText([...newestFirst].reverse())

    await page.getByRole('button', { name: 'Sort' }).click()
    await page.getByRole('menuitem', { name: 'Newest' }).click()
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })
})

for (const path of ['/', '/recipes', `/recipes/${publishedRecipes[0].slug}`]) {
  test(`${path} shows no pending or rejected recipe, not even in the search options`, async ({ page }) => {
    await page.goto(path)
    for (const hidden of hiddenRecipes) {
      await expect(page.getByText(hidden.name)).toHaveCount(0)
    }

    await search(page).fill('E2E')

    await expect(page.getByRole('option')).toHaveCount(publishedRecipes.length)
    for (const hidden of hiddenRecipes) {
      await expect(page.getByRole('option', { name: hidden.name })).toHaveCount(0)
    }
  })
}
