import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { connect, deleteSessions, disconnect, findRecipe, reseed } from './db.ts'
import { pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, seedRecipe, type SeedRecipe } from './fixtures.ts'
import { cloudinaryDestroys } from './uploads.ts'

// Admins delete a recipe from its edit page (components/DeleteRecipe.tsx): a
// "Delete recipe" section below the form opens a confirm dialog.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')

const section = (page: Page) => page.getByRole('region', { name: 'Delete recipe', exact: true })
const openButton = (page: Page) => section(page).getByRole('button', { name: 'Delete recipe', exact: true })
const dialog = (page: Page, recipe: SeedRecipe) => page.getByRole('dialog', { name: `Delete ${recipe.name}?` })
const cancelButton = (page: Page, recipe: SeedRecipe) =>
  dialog(page, recipe).getByRole('button', { name: 'Cancel', exact: true })
const confirmButton = (page: Page, recipe: SeedRecipe) =>
  dialog(page, recipe).getByRole('button', { name: 'Delete', exact: true })
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })

// Opens a recipe's edit page and waits until the "Delete recipe" button is
// hydrated, so a press is never lost.
async function openEditPage(page: Page, recipe: SeedRecipe) {
  await page.goto(`/recipes/${recipe.slug}/edit`)
  await expect(openButton(page)).toBeVisible()
  await expect
    .poll(() => openButton(page).evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
    .toBe(true)
}

async function openDialog(page: Page, recipe: SeedRecipe) {
  await openEditPage(page, recipe)
  await openButton(page).click()
  await expect(dialog(page, recipe)).toBeVisible()
}

test.describe('signed in as admin', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  })

  for (const recipe of [stew, pendingRecipe, rejectedRecipe]) {
    test(`sees the "Delete recipe" section below the form on a ${recipe.status} recipe's edit page`, async ({
      page,
    }) => {
      await openEditPage(page, recipe)

      await expect(section(page).getByRole('heading', { level: 2, name: 'Delete recipe', exact: true })).toBeVisible()
      await expect(
        section(page).getByText("Removes it for everyone, along with its photo. This can't be undone.", { exact: true })
      ).toBeVisible()
      await expect(openButton(page)).toHaveAttribute('type', 'button')
      expect((await openButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44)
      // Outside the form, below it, and lined up with it.
      await expect(page.locator('form').getByRole('region', { name: 'Delete recipe' })).toHaveCount(0)
      const form = (await page.locator('form').boundingBox())!
      const sectionBox = (await section(page).boundingBox())!
      expect(sectionBox.y).toBeGreaterThanOrEqual(form.y + form.height)
      const pageHeading = (await page.getByRole('heading', { level: 1, name: 'Edit Recipe' }).boundingBox())!
      const sectionHeading = (await section(page).getByRole('heading', { level: 2 }).boundingBox())!
      expect(sectionHeading.x).toBe(pageHeading.x)
    })
  }

  test('the dialog is labelled by its title, explains the delete, and gives Cancel the initial focus', async ({
    page,
  }) => {
    await openDialog(page, stew)

    await expect(
      dialog(page, stew).getByText("It's removed for everyone, along with its photo. This can't be undone.", {
        exact: true,
      })
    ).toBeVisible()
    await expect(cancelButton(page, stew)).toBeFocused()
    await expect(confirmButton(page, stew)).toBeEnabled()
  })

  test('Cancel closes the dialog, returns focus to "Delete recipe" and keeps the recipe', async ({ page }) => {
    await openDialog(page, stew)

    await cancelButton(page, stew).click()

    await expect(dialog(page, stew)).toHaveCount(0)
    await expect(openButton(page)).toBeFocused()
    expect(await findRecipe({ _id: stew._id })).not.toBeNull()
    const response = await page.goto(`/recipes/${stew.slug}`)
    expect(response?.status()).toBe(200)
  })

  test('Escape closes the dialog, returns focus to "Delete recipe" and keeps the recipe', async ({ page }) => {
    await openDialog(page, stew)

    await page.keyboard.press('Escape')

    await expect(dialog(page, stew)).toHaveCount(0)
    await expect(openButton(page)).toBeFocused()
    expect(await findRecipe({ _id: stew._id })).not.toBeNull()
    const response = await page.goto(`/recipes/${stew.slug}`)
    expect(response?.status()).toBe(200)
  })

  test('clicking the backdrop closes the dialog and keeps the recipe', async ({ page }) => {
    await openDialog(page, stew)

    // The top-left corner is backdrop, outside the centred panel.
    await page.mouse.click(5, 5)
    // Two frames: long enough for a wrongly closed dialog (no transition) to unmount.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    await expect(dialog(page, stew)).toHaveCount(0)
    expect(await findRecipe({ _id: stew._id })).not.toBeNull()
  })

  test('confirming deletes the recipe, lands on /recipes with "Recipe deleted", and its page 404s', async ({
    page,
  }) => {
    await openDialog(page, stew)

    await confirmButton(page, stew).click()

    await expect(page).toHaveURL('/recipes')
    await expect(toast(page, 'Recipe deleted')).toBeVisible()
    expect(await findRecipe({ _id: stew._id })).toBeNull()
    await expect(page.getByRole('link', { name: seedRecipe('E2E Chicken Tacos').name })).toBeVisible()
    await expect(page.getByRole('link', { name: stew.name })).toHaveCount(0)

    const response = await page.goto(`/recipes/${stew.slug}`)
    expect(response?.status()).toBe(404)
  })

  test("confirming deletes the recipe's photo from Cloudinary", async ({ page }) => {
    await openDialog(page, pendingRecipe)

    await confirmButton(page, pendingRecipe).click()

    await expect(page).toHaveURL('/recipes')
    expect(cloudinaryDestroys()).toEqual([
      expect.objectContaining({ public_id: pendingRecipe.imagePublicId, invalidate: 'true' }),
    ])
  })

  test('while deleting, both buttons are disabled, Delete reads "Deleting…", and the dialog stays open', async ({
    page,
  }) => {
    await openDialog(page, stew)
    // Holds the server action's request until the test has tried to close the dialog.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(`**/recipes/${stew.slug}/edit`, async (route) => {
      if (route.request().method() === 'POST') await held
      await route.continue()
    })

    await confirmButton(page, stew).click()

    const deleting = dialog(page, stew).getByRole('button', { name: 'Deleting…', exact: true })
    await expect(deleting).toBeDisabled()
    await expect(cancelButton(page, stew)).toBeDisabled()
    // While the modal is open the page behind it is hidden from the
    // accessibility tree; closing un-hides it at once, before any leave transition.
    const pageHeading = page.getByRole('heading', { level: 1, name: 'Edit Recipe' })
    await page.keyboard.press('Escape')
    await expect(pageHeading).toHaveCount(0)
    await page.mouse.click(5, 5)
    await expect(pageHeading).toHaveCount(0)
    // Gone before the held request reaches the server, so the delete answers
    // with an error, which only an open dialog can show.
    await (await connect()).collection('recipes').deleteOne({ slug: stew.slug })

    release()
    await expect(dialog(page, stew).getByRole('alert')).toHaveText('This recipe no longer exists.')
  })

  test('a recipe deleted after the page loaded shows "This recipe no longer exists." and the dialog stays open', async ({
    page,
  }) => {
    await openDialog(page, stew)
    // Another admin's delete, in another tab.
    await (await connect()).collection('recipes').deleteOne({ slug: stew.slug })

    await confirmButton(page, stew).click()

    await expect(dialog(page, stew).getByRole('alert')).toHaveText('This recipe no longer exists.')
    await expect(dialog(page, stew)).toBeVisible()
    await expect(confirmButton(page, stew)).toBeEnabled()
    await expect(cancelButton(page, stew)).toBeEnabled()
    await expect(page).toHaveURL(`/recipes/${stew.slug}/edit`)
  })

  test('a delete that throws (the session ended) shows an error in the dialog and keeps the recipe', async ({
    page,
  }) => {
    await openDialog(page, stew)
    await deleteSessions()

    await confirmButton(page, stew).click()

    await expect(dialog(page, stew).getByRole('alert')).toHaveText(
      /^Something went wrong.*Reload the page and try again\.$/
    )
    await expect(dialog(page, stew)).toBeVisible()
    await expect(confirmButton(page, stew)).toBeEnabled()
    expect(await findRecipe({ _id: stew._id })).not.toBeNull()
  })

  test('the section is hidden when printing', async ({ page }) => {
    await openEditPage(page, stew)

    await page.emulateMedia({ media: 'print' })

    await expect(section(page)).toBeHidden()
  })
})

test('the owner of a pending recipe sees no "Delete recipe" section on its edit page', async ({ context, page }) => {
  await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })

  await page.goto(`/recipes/${pendingRecipe.slug}/edit`)

  await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeVisible()
  await expect(section(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete recipe' })).toHaveCount(0)
})
