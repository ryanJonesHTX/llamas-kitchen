import type { Locator, Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { E2E_AUTH_URL, pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, seedRecipe } from './fixtures.ts'
import { openRecipe } from './recipePage.ts'
import { fakeShare, settle, shareLog } from './share.ts'

// The Share button in the recipe page's actions row (published recipes only).
// It opens the native share sheet (navigator.share) where there is one, and
// otherwise copies the link and says so through the Toaster. Both browser
// APIs are faked by share.ts.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')
// The link is built on the server from AUTH_URL, never from the address bar.
const STEW_URL = `${E2E_AUTH_URL}/recipes/${stew.slug}`
const LINK_COPIED = 'Link copied'
const COPY_FAILED = "Couldn't copy the link"

const shareButton = (page: Page) => page.getByRole('button', { name: 'Share', exact: true })
const cookMode = (page: Page) => page.getByRole('button', { name: 'Cook mode', exact: true })
const editLink = (page: Page) => page.getByRole('link', { name: 'Edit', exact: true })

// The Toaster's live region: the page's only status outside <main>.
const toasterStatus = (page: Page) => page.getByRole('status').and(page.locator(':not(main *)'))
const toast = (page: Page, text: string) => toasterStatus(page).filter({ hasText: text })
// The decorative icon on the toast card, beside the message.
const toastIcon = (page: Page) => toasterStatus(page).locator('xpath=..').locator('svg').first()

const color = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).color)

// The computed color of a theme token (styles/globals.css), e.g. "danger".
const tokenColor = (page: Page, token: string) =>
  page.evaluate((token) => {
    const probe = document.createElement('span')
    probe.style.color = `var(--${token})`
    document.body.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }, token)

// Opens a recipe and waits until the Share button is hydrated, so a press is never lost.
async function openForSharing(page: Page, path = `/recipes/${stew.slug}`) {
  await page.goto(path)
  await expect(shareButton(page)).toBeVisible()
  await expect
    .poll(() => shareButton(page).evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
    .toBe(true)
}

// Checks, once the page has finished reacting, that no toast was raised.
async function expectNoToast(page: Page) {
  await settle(page)
  expect((await shareLog(page)).flashEvents).toBe(0)
  await expect(toasterStatus(page)).toHaveCount(1)
  await expect(toasterStatus(page)).toHaveText('')
}

test.describe('with the Web Share API', () => {
  test('opens the share sheet once with the recipe name and its clean link, and shows no toast', async ({ page }) => {
    await fakeShare(page, { share: 'resolve', clipboard: 'resolve' })
    // A query string and hash in the address bar must not leak into the shared link.
    await openForSharing(page, `/recipes/${stew.slug}?utm_source=test#steps`)

    await shareButton(page).click()

    await expect.poll(async () => (await shareLog(page)).shares).toHaveLength(1)
    const log = await shareLog(page)
    expect(log.shares).toStrictEqual([{ title: stew.name, url: STEW_URL }])
    expect(log.writes).toEqual([])
    await expectNoToast(page)
  })

  test('cancelling the share sheet (AbortError) copies nothing and shows no toast', async ({ page }) => {
    await fakeShare(page, { share: 'abort', clipboard: 'resolve' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect.poll(async () => (await shareLog(page)).shares).toHaveLength(1)
    await settle(page)
    expect((await shareLog(page)).writes).toEqual([])
    await expectNoToast(page)
  })

  test('a share that fails for another reason copies the link instead and says "Link copied"', async ({ page }) => {
    await fakeShare(page, { share: 'error', clipboard: 'resolve' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, LINK_COPIED)).toBeVisible()
    const log = await shareLog(page)
    expect(log.shares).toStrictEqual([{ title: stew.name, url: STEW_URL }])
    expect(log.writes).toEqual([STEW_URL])
  })
})

test.describe('without the Web Share API', () => {
  test('copies the link and says "Link copied"', async ({ page }) => {
    await fakeShare(page, { share: 'absent', clipboard: 'resolve' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, LINK_COPIED)).toBeVisible()
    expect(await shareLog(page)).toEqual({ shares: [], writes: [STEW_URL], flashEvents: 1 })
  })

  test('says "Couldn\'t copy the link" when the clipboard refuses', async ({ page }) => {
    await fakeShare(page, { share: 'absent', clipboard: 'reject' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, COPY_FAILED)).toBeVisible()
    expect((await shareLog(page)).writes).toEqual([STEW_URL])
    await expect(toasterStatus(page)).not.toContainText(LINK_COPIED)
  })

  test('says "Couldn\'t copy the link" when there is no clipboard', async ({ page }) => {
    await fakeShare(page, { share: 'absent', clipboard: 'absent' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, COPY_FAILED)).toBeVisible()
  })
})

test.describe('the toasts', () => {
  test('stay in the single Toaster region outside <main>', async ({ page }) => {
    await fakeShare(page, { share: 'absent', clipboard: 'resolve' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, LINK_COPIED)).toBeVisible()
    await expect(toasterStatus(page)).toHaveCount(1)
    await expect(page.getByRole('main').getByText(LINK_COPIED)).toHaveCount(0)
  })

  test('"Link copied" shows the success icon', async ({ page }) => {
    await fakeShare(page, { share: 'absent', clipboard: 'resolve' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, LINK_COPIED)).toBeVisible()
    expect(await color(toastIcon(page))).toBe(await tokenColor(page, 'success'))
  })

  test('"Couldn\'t copy the link" shows the error icon, not the green check', async ({ page }) => {
    await fakeShare(page, { share: 'absent', clipboard: 'reject' })
    await openForSharing(page)

    await shareButton(page).click()

    await expect(toast(page, COPY_FAILED)).toBeVisible()
    const iconColor = await color(toastIcon(page))
    expect(iconColor).toBe(await tokenColor(page, 'danger'))
    expect(iconColor).not.toBe(await tokenColor(page, 'success'))
  })
})

test.describe('the Share button', () => {
  test('sits between Edit and Cook mode in Tab order', async ({ context, page }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
    await fakeShare(page, { share: 'resolve', clipboard: 'resolve' })
    await openForSharing(page)

    await editLink(page).focus()
    await page.keyboard.press('Tab')
    await expect(shareButton(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cookMode(page)).toBeFocused()
  })

  test('comes right before Cook mode for a signed-out visitor', async ({ page }) => {
    await fakeShare(page, { share: 'resolve', clipboard: 'resolve' })
    await openForSharing(page)

    await shareButton(page).focus()
    await page.keyboard.press('Tab')
    await expect(cookMode(page)).toBeFocused()
  })

  test('matches the Cook mode button and is at least 44px tall on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await fakeShare(page, { share: 'resolve', clipboard: 'resolve' })
    await openForSharing(page)

    const look = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          height: style.height,
          borderColor: style.borderTopColor,
          borderRadius: style.borderTopLeftRadius,
          background: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
        }
      })
    expect(await look(shareButton(page))).toEqual(await look(cookMode(page)))
    expect((await shareButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('is hidden when printing', async ({ page }) => {
    await fakeShare(page, { share: 'resolve', clipboard: 'resolve' })
    await openForSharing(page)

    await page.emulateMedia({ media: 'print' })

    await expect(shareButton(page)).toBeHidden()
  })

  for (const recipe of [pendingRecipe, rejectedRecipe]) {
    test(`is not shown on the ${recipe.status} recipe to its owner`, async ({ context, page }) => {
      await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })
      await openRecipe(page, recipe.slug)

      await expect(cookMode(page)).toBeVisible()
      await expect(shareButton(page)).toHaveCount(0)
    })

    test(`is not shown on the ${recipe.status} recipe to an admin`, async ({ context, page }) => {
      await signInAs(context, { email: 'admin@example.com', role: 'admin' })
      await openRecipe(page, recipe.slug)

      await expect(cookMode(page)).toBeVisible()
      await expect(shareButton(page)).toHaveCount(0)
    })
  }
})
