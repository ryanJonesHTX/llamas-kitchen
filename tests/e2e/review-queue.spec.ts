import type { Page } from '@playwright/test'
import mongoose from 'mongoose'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { connect, disconnect, findRecipe, insertRecipes, reseed, USERS_COLLECTION } from './db.ts'
import { pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, type SeedRecipe } from './fixtures.ts'

// /admin/queue: admins approve or reject pending recipes, oldest first.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const QUEUE = '/admin/queue'

// Submitted before the seed's pending recipe, so it heads the queue.
const olderPending: SeedRecipe = {
  ...pendingRecipe,
  _id: '65a000000000000000000201',
  name: 'E2E Pending Lamb Tagine',
  slug: 'e2e-pending-lamb-tagine',
  createdAt: new Date('2024-05-15T12:00:00Z'),
}

const queueItem = (page: Page, recipe: SeedRecipe) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: recipe.name }) })
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })
const queueHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Review queue' })
const reasonField = (page: Page) => page.getByRole('textbox', { name: 'Reason for rejecting' })

test('signed out, visiting the queue lands on the sign-in page', async ({ page }) => {
  await page.goto(QUEUE)

  const url = new URL(page.url())
  expect(url.pathname).toMatch(/^\/api\/auth\/signin/)
  expect(url.searchParams.get('callbackUrl')).toBe(QUEUE)
})

test('signed in as a user, the queue responds 404', async ({ context, page }) => {
  await signInAs(context, { email: 'user@example.com', role: 'user' })

  const response = await page.goto(QUEUE)

  expect(response?.status()).toBe(404)
})

test.describe('signed in as admin', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  })

  test('lists only pending recipes, oldest first, with submitter, date and a link to each', async ({ page }) => {
    await insertRecipes([olderPending])
    // The submitter's account, as @auth/mongodb-adapter stores it.
    await (await connect()).collection(USERS_COLLECTION).insertOne({
      _id: new mongoose.Types.ObjectId(SEED_SUBMITTER_ID),
      name: 'Pat Cook',
      email: 'pat@example.com',
      emailVerified: null,
      image: null,
      role: 'user',
    })

    await page.goto(QUEUE)

    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([olderPending.name, pendingRecipe.name])
    await expect(page.getByRole('heading', { level: 2, name: rejectedRecipe.name })).toHaveCount(0)
    const item = queueItem(page, pendingRecipe)
    await expect(item.getByRole('link', { name: pendingRecipe.name })).toHaveAttribute('href', `/recipes/${pendingRecipe.slug}`)
    await expect(item.getByText('Submitted by Pat Cook on Jun 1, 2024')).toBeVisible()
    await expect(item.getByText(pendingRecipe.description)).toBeVisible()
  })

  test('approving a recipe removes it from the queue, shows "Recipe approved" and publishes it', async ({ page }) => {
    await page.goto(QUEUE)

    await queueItem(page, pendingRecipe).getByRole('button', { name: `Approve ${pendingRecipe.name}` }).click()

    await expect(toast(page, 'Recipe approved')).toBeVisible()
    await expect(queueItem(page, pendingRecipe)).toHaveCount(0)
    // The focused item is gone, so focus moves to one predictable place.
    await expect(queueHeading(page)).toBeFocused()
    await expect(page.getByText('Nothing waiting for review.')).toBeVisible()
    expect(await findRecipe({ _id: pendingRecipe._id })).toMatchObject({ status: 'published' })

    await page.goto('/recipes')
    await expect(page.getByRole('link', { name: pendingRecipe.name })).toBeVisible()
  })

  test('two approvals in a row each show the toast afresh, restarting its timer', async ({ page }) => {
    await insertRecipes([olderPending])
    await page.goto(QUEUE)

    await queueItem(page, olderPending).getByRole('button', { name: `Approve ${olderPending.name}` }).click()
    await expect(toast(page, 'Recipe approved')).toBeVisible()
    // Marks the first toast's text, to tell it apart from the second.
    await toast(page, 'Recipe approved').locator('span').evaluate((el) => el.setAttribute('data-first', ''))
    // Partway through the toast's 4 seconds.
    await page.waitForTimeout(2500)

    await queueItem(page, pendingRecipe).getByRole('button', { name: `Approve ${pendingRecipe.name}` }).click()
    await expect(queueItem(page, pendingRecipe)).toHaveCount(0)
    // New text in the live region, so screen readers announce it again.
    await expect(toast(page, 'Recipe approved').locator('span:not([data-first])')).toHaveText('Recipe approved')
    // Past the first toast's 4 seconds, the second still shows.
    await page.waitForTimeout(2500)
    await expect(toast(page, 'Recipe approved')).toBeVisible()
  })

  test('rejecting with a reason removes it from the queue, and the submitter sees the reason', async ({
    context,
    page,
  }) => {
    const reason = 'Please add the oven temperature.'
    await page.goto(QUEUE)
    const item = queueItem(page, pendingRecipe)

    await item.getByRole('button', { name: `Reject ${pendingRecipe.name}` }).click()
    await expect(reasonField(page)).toBeFocused()
    await reasonField(page).fill(`  ${reason}  `)
    await item.getByRole('button', { name: 'Reject recipe', exact: true }).click()

    await expect(toast(page, 'Recipe rejected')).toBeVisible()
    await expect(queueItem(page, pendingRecipe)).toHaveCount(0)
    await expect(queueHeading(page)).toBeFocused()
    expect(await findRecipe({ _id: pendingRecipe._id })).toMatchObject({ status: 'rejected', rejectionReason: reason })

    // The same browser, now as the submitter.
    await context.clearCookies()
    await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })
    await page.goto(`/recipes/${pendingRecipe.slug}`)
    await expect(page.getByText(`Rejected — ${reason}`)).toBeVisible()
  })

  test('approving a recipe the owner edited after the queue loaded is refused, and it stays pending', async ({ page }) => {
    await page.goto(QUEUE)
    const item = queueItem(page, pendingRecipe)
    await expect(item).toBeVisible()
    // The owner's edit, saved while the admin looks at the queue.
    await (await connect())
      .collection('recipes')
      .updateOne({ slug: pendingRecipe.slug }, { $set: { description: 'Now with spam.', updatedAt: new Date() } })

    await item.getByRole('button', { name: `Approve ${pendingRecipe.name}` }).click()

    await expect(item.getByRole('alert')).toHaveText(
      'This recipe changed since you loaded the queue. Reload to see the latest version.'
    )
    expect(await findRecipe({ _id: pendingRecipe._id })).toMatchObject({ status: 'pending', description: 'Now with spam.' })
  })

  test('rejecting with an empty reason is blocked, and a blank one gets an inline error', async ({ page }) => {
    await page.goto(QUEUE)
    const item = queueItem(page, pendingRecipe)
    await item.getByRole('button', { name: `Reject ${pendingRecipe.name}` }).click()
    const reject = item.getByRole('button', { name: 'Reject recipe', exact: true })

    // The browser's required check stops the submit.
    await reject.click()
    expect(await reasonField(page).evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing)).toBe(true)

    // Spaces pass the browser's check; the server refuses them.
    await reasonField(page).fill('   ')
    await reject.click()
    await expect(item.getByRole('alert')).toHaveText('Please give a reason.')
    await expect(reasonField(page)).toHaveAttribute('aria-invalid', 'true')

    await expect(queueItem(page, pendingRecipe)).toBeVisible()
    expect(await findRecipe({ _id: pendingRecipe._id })).toMatchObject({ status: 'pending' })
  })

  test('caps the reason at the maximum length', async ({ page }) => {
    await page.goto(QUEUE)
    await queueItem(page, pendingRecipe).getByRole('button', { name: `Reject ${pendingRecipe.name}` }).click()

    await expect(reasonField(page)).toHaveAttribute('maxlength', '500')
    await expect(page.getByText('Up to 500 characters.', { exact: false })).toBeVisible()
  })

  test('with nothing pending, says "Nothing waiting for review."', async ({ page }) => {
    await (await connect()).collection('recipes').deleteOne({ slug: pendingRecipe.slug })

    await page.goto(QUEUE)

    await expect(page.getByText('Nothing waiting for review.')).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(0)
  })
})
