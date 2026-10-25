import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, seedRecipe, type SeedRecipe } from './fixtures.ts'

// /my-recipes: the signed-in user's own recipes of any status, newest first.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const MY_RECIPES = '/my-recipes'

// The submitter's newest recipe, already published, which they may no longer edit.
const ownPublished: SeedRecipe = {
  ...seedRecipe('E2E Pork Chops'),
  _id: '65a000000000000000000301',
  name: 'E2E Approved Pork Pie',
  slug: 'e2e-approved-pork-pie',
  submittedBy: SEED_SUBMITTER_ID,
  createdAt: new Date('2024-08-01T12:00:00Z'),
}

const item = (page: Page, recipe: SeedRecipe) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: recipe.name }) })
const editLink = (page: Page, recipe: SeedRecipe) => page.getByRole('link', { name: `Edit ${recipe.name}` })

test('signed out, visiting My recipes lands on the sign-in page', async ({ page }) => {
  await page.goto(MY_RECIPES)

  const url = new URL(page.url())
  expect(url.pathname).toMatch(/^\/api\/auth\/signin/)
  expect(url.searchParams.get('callbackUrl')).toBe(MY_RECIPES)
})

test.describe('signed in as the submitter', () => {
  test.beforeEach(async ({ context }) => {
    await insertRecipes([ownPublished])
    await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })
  })

  test('lists only their recipes, newest first, each linking to its page', async ({ page }) => {
    await page.goto(MY_RECIPES)

    await expect(page.getByRole('heading', { level: 1, name: 'My recipes' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([ownPublished.name, rejectedRecipe.name, pendingRecipe.name])
    await expect(item(page, pendingRecipe).getByRole('link', { name: pendingRecipe.name, exact: true })).toHaveAttribute(
      'href',
      `/recipes/${pendingRecipe.slug}`
    )
    await expect(item(page, pendingRecipe).getByText('Added on Jun 1, 2024')).toBeVisible()
  })

  test('shows each status, the rejection reason, and Edit only on pending and rejected recipes', async ({ page }) => {
    await page.goto(MY_RECIPES)

    await expect(item(page, ownPublished).getByText('Published', { exact: true })).toBeVisible()
    await expect(item(page, pendingRecipe).getByText('Pending review', { exact: true })).toBeVisible()
    await expect(item(page, rejectedRecipe).getByText('Rejected', { exact: true })).toBeVisible()
    await expect(item(page, rejectedRecipe).getByText(`Reason: ${rejectedRecipe.rejectionReason}`)).toBeVisible()
    await expect(page.getByText('Reason:')).toHaveCount(1)

    await expect(editLink(page, ownPublished)).toHaveCount(0)
    for (const recipe of [pendingRecipe, rejectedRecipe]) {
      await expect(editLink(page, recipe)).toHaveAttribute('href', `/recipes/${recipe.slug}/edit`)
    }
  })

  test('is kept out of search engines', async ({ page }) => {
    await page.goto(MY_RECIPES)

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })
})

test('with no recipes, says so and links to Add a recipe', async ({ context, page }) => {
  await signInAs(context, { email: 'new-cook@example.com', role: 'user' })

  await page.goto(MY_RECIPES)

  await expect(page.getByText("You haven't added any recipes yet.")).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add a recipe' })).toHaveAttribute('href', '/new')
})
