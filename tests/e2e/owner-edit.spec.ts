import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, findRecipe, insertRecipes, reseed } from './db.ts'
import { pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, seedRecipe, type SeedRecipe } from './fixtures.ts'
import { formField } from './recipeForm.ts'

// A submitter may edit their own recipe while it is pending or rejected.
// Saving a rejected one sends it back to review. Published recipes, and
// anyone else's, stay admin-only.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

// A recipe the submitter got published, which they may no longer edit.
const ownPublished: SeedRecipe = {
  ...seedRecipe('E2E Pork Chops'),
  _id: '65a000000000000000000101',
  name: 'E2E Approved Pork Pie',
  slug: 'e2e-approved-pork-pie',
  submittedBy: SEED_SUBMITTER_ID,
}

const editLink = (page: Page) => page.getByRole('link', { name: 'Edit', exact: true })
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })

test.describe('signed in as the submitter', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })
  })

  for (const recipe of [pendingRecipe, rejectedRecipe]) {
    test(`sees Edit on their ${recipe.status} recipe`, async ({ page }) => {
      await page.goto(`/recipes/${recipe.slug}`)

      await expect(editLink(page)).toHaveAttribute('href', `/recipes/${recipe.slug}/edit`)
    })
  }

  test('sees no Edit on their published recipe, and its edit page responds 404', async ({ page }) => {
    await insertRecipes([ownPublished])

    await page.goto(`/recipes/${ownPublished.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: ownPublished.name })).toBeVisible()
    await expect(editLink(page)).toHaveCount(0)

    const response = await page.goto(`/recipes/${ownPublished.slug}/edit`)
    expect(response?.status()).toBe(404)
  })

  test('sees no Edit on a published recipe of someone else', async ({ page }) => {
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(editLink(page)).toHaveCount(0)
  })

  test('edits their pending recipe with "Save changes": no slug field, still pending, "Recipe saved"', async ({
    page,
  }) => {
    await page.goto(`/recipes/${pendingRecipe.slug}/edit`)
    await expect(formField(page, 'Slug')).toHaveCount(0)
    await expect(page.getByText('Rejected', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Your changes stay pending until an admin reviews the recipe.')).toBeVisible()

    await formField(page, 'Description').fill('Now with a lattice top.')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect(page).toHaveURL(`/recipes/${pendingRecipe.slug}`)
    await expect(toast(page, 'Recipe saved')).toBeVisible()
    await expect(page.getByText('Pending review', { exact: true })).toBeVisible()
    expect(await findRecipe({ _id: pendingRecipe._id })).toMatchObject({
      description: 'Now with a lattice top.',
      status: 'pending',
    })
  })

  test('resubmits their rejected recipe and lands on its page, pending, with "Recipe submitted for review"', async ({
    page,
  }) => {
    await page.goto(`/recipes/${rejectedRecipe.slug}/edit`)
    await expect(page.getByText(`Rejected — ${rejectedRecipe.rejectionReason}`)).toBeVisible()
    await expect(page.getByText('Saving sends the recipe back for review.')).toBeVisible()
    await expect(formField(page, 'Slug')).toHaveCount(0)

    await formField(page, 'Description').fill('Now a real recipe.')
    await page.getByRole('button', { name: 'Resubmit for review', exact: true }).click()

    await expect(page).toHaveURL(`/recipes/${rejectedRecipe.slug}`)
    await expect(toast(page, 'Recipe submitted for review')).toBeVisible()
    await expect(page.getByText('Pending review', { exact: true })).toBeVisible()
    const saved = await findRecipe({ _id: rejectedRecipe._id })
    expect(saved).toMatchObject({ description: 'Now a real recipe.', status: 'pending' })
    expect(saved?.rejectionReason).toBeUndefined()
  })
})

test.describe('signed in as another user', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { email: 'someone-else@example.com', role: 'user' })
  })

  for (const recipe of [pendingRecipe, rejectedRecipe]) {
    test(`the edit page of someone else's ${recipe.status} recipe responds 404`, async ({ page }) => {
      const response = await page.goto(`/recipes/${recipe.slug}/edit`)

      expect(response?.status()).toBe(404)
    })
  }
})

test('signed in as admin, the edit form of a rejected recipe shows the slug field and "Save recipe"', async ({
  context,
  page,
}) => {
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  await page.goto(`/recipes/${rejectedRecipe.slug}/edit`)

  await expect(formField(page, 'Slug')).toHaveValue(rejectedRecipe.slug)
  await expect(page.getByRole('button', { name: 'Save recipe', exact: true })).toBeVisible()
})
