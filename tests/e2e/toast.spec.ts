import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { seedRecipe } from './fixtures.ts'
import { fillNewRecipe, formField, newRecipe, saveButton } from './recipeForm.ts'

// The "Recipe saved" toast: a successful save sets the one-shot "flash"
// cookie, and components/Toaster.tsx shows its message and clears it.

test.beforeEach(async ({ context }) => {
  await reseed()
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')

const toast = (page: Page) => page.getByRole('status').filter({ hasText: 'Recipe saved' })

const flashCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((cookie) => cookie.name === 'flash')

async function expectToastOnce(page: Page, context: BrowserContext) {
  await expect(toast(page)).toBeVisible()
  expect(await flashCookie(context)).toBeUndefined()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(toast(page)).toHaveCount(0)
}

test('saving a new recipe shows "Recipe saved" on its page once, not after a reload', async ({ page, context }) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  await expectToastOnce(page, context)
})

test('saving an edit shows "Recipe saved" on the recipe page once, not after a reload', async ({ page, context }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)
  await formField(page, 'Description').fill('Even heartier.')
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  await expectToastOnce(page, context)
})

// After a slug change the form's own route (/recipes/<old>/edit) is gone, so
// nothing may re-render it: its 404 must never reach the screen. (A cookie
// set by the server action would make Next re-render it.)
test('saving a new slug never flashes the not-found page and shows the toast on the new URL', async ({ page }) => {
  const newSlug = 'e2e-renamed-stew'
  await page.goto(`/recipes/${stew.slug}/edit`)
  await page.evaluate(() => {
    const seen = () => document.body.innerText.includes('Page not found')
    ;(window as unknown as { sawNotFound: boolean }).sawNotFound = seen()
    new MutationObserver(() => {
      if (seen()) (window as unknown as { sawNotFound: boolean }).sawNotFound = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })

  await formField(page, 'Slug').fill(newSlug)
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newSlug}`)
  await expect(toast(page)).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { sawNotFound: boolean }).sawNotFound)).toBe(false)
})

test('the toast closes with its Dismiss button', async ({ page }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)
  await saveButton(page).click()
  await expect(toast(page)).toBeVisible()

  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()

  await expect(toast(page)).toHaveCount(0)
})

test('a flash cookie with an unknown key shows nothing and is cleared', async ({ page, context }) => {
  await context.addCookies([{ name: 'flash', value: 'hacked', url: 'http://127.0.0.1:3100' }])

  await page.goto(`/recipes/${stew.slug}`)

  await expect.poll(() => flashCookie(context)).toBeUndefined()
  await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: /\S/ })).toHaveCount(0)
})
