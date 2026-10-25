import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { deleteAllRecipes, disconnect, reseed } from './db.ts'
import { hiddenRecipes, publishedRecipes } from './fixtures.ts'

// The home page, and the public pages showing published recipes only.
// The recipe list itself is covered in recipe-list.spec.ts.
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

  test('with no recipes, says so in place of the recipe tiles', async ({ page }) => {
    await deleteAllRecipes()
    await page.goto('/')

    await expect(page.getByText('No recipes yet.')).toBeVisible()
    await expect(latestRecipeNames(page)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Add the first recipe' })).toHaveCount(0)
  })

  for (const role of ['user', 'admin'] as const) {
    test(`with no recipes, offers a signed-in ${role} a link to add the first one`, async ({ context, page }) => {
      await deleteAllRecipes()
      await signInAs(context, { email: `${role}@example.com`, role })
      await page.goto('/')

      await expect(page.getByRole('link', { name: 'Add the first recipe' })).toHaveAttribute('href', '/new')
    })
  }
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
