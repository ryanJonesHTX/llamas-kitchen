import type { Page } from '@playwright/test'
import { MAX_PENDING_PER_USER } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, findRecipe, insertRecipes, reseed } from './db.ts'
import { pendingRecipe, type SeedRecipe } from './fixtures.ts'
import { alertWith, fillNewRecipe, newRecipe, saveButton } from './recipeForm.ts'

// Any signed-in user may submit a recipe on /new. A non-admin's waits for
// review: only they and admins see it until it's approved.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const USER_ID = '64e0000000000000000000aa'

const submitButton = (page: Page) => page.getByRole('button', { name: 'Submit for review', exact: true })
const reviewNote = (page: Page) => page.getByText('Submissions are reviewed before they appear publicly.')

test.describe('signed in as a user', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { id: USER_ID, email: 'user@example.com', role: 'user' })
  })

  test('submitting a recipe saves it pending and shows it only to its submitter', async ({ page }) => {
    await page.goto('/new')
    await expect(reviewNote(page)).toBeVisible()
    await expect(saveButton(page)).toHaveCount(0)
    await fillNewRecipe(page)
    await submitButton(page).click()

    await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
    await expect(page.getByRole('status').filter({ hasText: 'Recipe submitted for review' })).toBeVisible()
    await expect(page.getByText('Pending review', { exact: true })).toBeVisible()
    const saved = await findRecipe({ slug: newRecipe.slug })
    expect(saved).toMatchObject({ status: 'pending' })
    expect(saved?.publishedAt).toBeUndefined()
    expect(String(saved?.submittedBy)).toBe(USER_ID)

    for (const path of ['/recipes', '/']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: 'E2E Pork Chops' })).toBeVisible()
      await expect(page.getByRole('heading', { name: newRecipe.name })).toHaveCount(0)
    }
  })

  test(`with ${MAX_PENDING_PER_USER} recipes awaiting review, submitting shows a form error`, async ({ page }) => {
    const waiting: SeedRecipe[] = Array.from({ length: MAX_PENDING_PER_USER }, (_, n) => ({
      ...pendingRecipe,
      _id: `65a0000000000000000001${String(n).padStart(2, '0')}`,
      name: `E2E Waiting Pie ${n + 1}`,
      slug: `e2e-waiting-pie-${n + 1}`,
      submittedBy: USER_ID,
    }))
    await insertRecipes(waiting)

    await page.goto('/new')
    await fillNewRecipe(page)
    await submitButton(page).click()

    await expect(alertWith(page, /You have 5 recipes waiting for review/)).toBeVisible()
    await expect(page).toHaveURL('/new')
    expect(await findRecipe({ slug: newRecipe.slug })).toBeNull()
  })
})

test('signed in as admin, /new has no review note and saves with "Save recipe"', async ({ context, page }) => {
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  await page.goto('/new')

  await expect(saveButton(page)).toBeVisible()
  await expect(submitButton(page)).toHaveCount(0)
  await expect(reviewNote(page)).toHaveCount(0)
})
