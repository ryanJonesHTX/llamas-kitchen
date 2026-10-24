import type { BrowserContext, Page, Response } from '@playwright/test'
import { expect, test } from './test.ts'
import { disconnect, reseed } from './db.ts'

// The theme toggle stores system | light | dark in the "theme" cookie. The
// root layout renders data-theme on <html> for light and dark (none for
// system), and globals.css picks the --bg token from it or the OS setting.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const LIGHT_BG = 'rgb(247, 245, 250)'
const DARK_BG = 'rgb(23, 21, 28)'
const ONE_YEAR_SECONDS = 31_536_000

type Choice = 'System' | 'Light' | 'Dark'
const CHOICES: Choice[] = ['System', 'Light', 'Dark']

// Desktop shows the toggle in the header; on mobile the header copy is
// hidden and the menu dialog's copy is the visible one.
const themeGroup = (page: Page) =>
  page.getByRole('group', { name: 'Color theme' }).filter({ visible: true })

const themeButton = (page: Page, choice: Choice) =>
  themeGroup(page).getByRole('button', { name: `${choice} theme`, exact: true })

const setThemeCookie = (context: BrowserContext, value: string) =>
  context.addCookies([{ name: 'theme', value, url: 'http://127.0.0.1:3100' }])

const themeCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((cookie) => cookie.name === 'theme')

// The opening <html ...> tag of the server-rendered document.
const htmlTag = async (response: Response | null) => {
  expect(response).not.toBeNull()
  const tag = (await response!.text()).match(/<html\b[^>]*>/)
  expect(tag).not.toBeNull()
  return tag![0]
}

const expectPressed = async (page: Page, pressed: Choice) => {
  for (const choice of CHOICES) {
    await expect(themeButton(page, choice)).toHaveAttribute(
      'aria-pressed',
      choice === pressed ? 'true' : 'false'
    )
  }
}

const expectBackground = (page: Page, color: string) =>
  expect(page.locator('body')).toHaveCSS('background-color', color)

const html = (page: Page) => page.locator('html')

test.describe('with no theme cookie', () => {
  test('renders no data-theme and presses "System theme"', async ({ page }) => {
    const response = await page.goto('/')

    expect(await htmlTag(response)).not.toContain('data-theme')
    await expect(html(page)).not.toHaveAttribute('data-theme')
    await expect(themeGroup(page)).toBeVisible()
    await expectPressed(page, 'System')
  })

  test('follows a dark OS setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')

    await expectBackground(page, DARK_BG)
  })

  test('follows a light OS setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')

    await expectBackground(page, LIGHT_BG)
  })
})

test('the toggle is three plain buttons in a group labelled "Color theme"', async ({ page }) => {
  await page.goto('/')

  await expect(themeGroup(page).getByRole('button')).toHaveCount(3)
  for (const choice of CHOICES) {
    await expect(themeButton(page, choice)).toHaveAttribute('type', 'button')
  }
})

test('clicking "Dark theme" darkens the page, presses Dark and stores a one-year Lax cookie', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  await themeButton(page, 'Dark').click()

  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expectBackground(page, DARK_BG)
  await expectPressed(page, 'Dark')

  const cookie = await themeCookie(context)
  expect(cookie?.value).toBe('dark')
  expect(cookie?.path).toBe('/')
  expect(cookie?.sameSite).toBe('Lax')
  // Max-Age is one year; allow a minute either side for test run time.
  const expectedExpiry = Date.now() / 1000 + ONE_YEAR_SECONDS
  expect(cookie?.expires).toBeGreaterThan(expectedExpiry - 60)
  expect(cookie?.expires).toBeLessThan(expectedExpiry + 60)
})

test('clicking a theme makes no server round trip', async ({ page }) => {
  await page.goto('/')
  await expect(themeGroup(page)).toBeVisible()

  // Navigations, server actions (POST) and router.refresh() RSC fetches.
  // Link prefetches also carry the RSC header, so they don't count.
  const roundTrips: string[] = []
  page.on('request', (request) => {
    const headers = request.headers()
    const isPrefetch = 'next-router-prefetch' in headers
    if (
      request.isNavigationRequest() ||
      request.method() !== 'GET' ||
      ('rsc' in headers && !isPrefetch)
    ) {
      roundTrips.push(`${request.method()} ${request.url()}`)
    }
  })

  await themeButton(page, 'Dark').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await themeButton(page, 'Light').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await themeButton(page, 'System').click()
  await expect(html(page)).not.toHaveAttribute('data-theme')

  expect(roundTrips).toEqual([])
})

test('a dark choice survives a reload and is already in the server-rendered HTML', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await themeButton(page, 'Dark').click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')

  const response = await page.reload()

  expect(await htmlTag(response)).toContain('data-theme="dark"')
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expectBackground(page, DARK_BG)
  await expectPressed(page, 'Dark')
})

test('an explicit light choice beats a dark OS setting, before and after a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expectBackground(page, DARK_BG)

  await themeButton(page, 'Light').click()

  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expectBackground(page, LIGHT_BG)
  await expectPressed(page, 'Light')

  const response = await page.reload()

  expect(await htmlTag(response)).toContain('data-theme="light"')
  await expectBackground(page, LIGHT_BG)
  await expectPressed(page, 'Light')
})

test('choosing "System theme" after "Dark theme" removes data-theme and follows the OS again', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await themeButton(page, 'Dark').click()
  await expectBackground(page, DARK_BG)

  await themeButton(page, 'System').click()

  await expect(html(page)).not.toHaveAttribute('data-theme')
  expect((await themeCookie(context))?.value).toBe('system')
  await expectPressed(page, 'System')
  await expectBackground(page, LIGHT_BG)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expectBackground(page, DARK_BG)

  const response = await page.reload()
  expect(await htmlTag(response)).not.toContain('data-theme')
})

test('an invalid theme cookie counts as system', async ({ context, page }) => {
  await setThemeCookie(context, 'purple')

  const response = await page.goto('/')

  expect(await htmlTag(response)).not.toContain('data-theme')
  await expect(html(page)).not.toHaveAttribute('data-theme')
  await expectPressed(page, 'System')
})

test('a dark cookie set before the first visit is in the first response', async ({
  context,
  page,
}) => {
  await setThemeCookie(context, 'dark')

  const response = await page.goto('/')

  expect(await htmlTag(response)).toContain('data-theme="dark"')
  await expectPressed(page, 'Dark')
})

test('Tab reaches the theme buttons and Enter or Space chooses one', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(themeGroup(page)).toBeVisible()

  // Tab forward until "System theme", the group's first button, has focus.
  const system = themeButton(page, 'System')
  const hasFocus = () => system.evaluate((el) => el === document.activeElement)
  for (let i = 0; i < 40 && !(await hasFocus()); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(system).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(themeButton(page, 'Light')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(themeButton(page, 'Dark')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expectPressed(page, 'Dark')

  await page.keyboard.press('Shift+Tab')
  await expect(themeButton(page, 'Light')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expectPressed(page, 'Light')
})

test.describe('mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: false })

  test('"Open main menu" shows the color theme toggle, and "Dark theme" there darkens the page', async ({
    context,
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')

    await page.getByRole('button', { name: 'Open main menu' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeVisible()
    const group = dialog.getByRole('group', { name: 'Color theme' })
    await expect(group).toBeVisible()

    await group.getByRole('button', { name: 'Dark theme', exact: true }).click()

    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expectBackground(page, DARK_BG)
    await expect(
      group.getByRole('button', { name: 'Dark theme', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    expect((await themeCookie(context))?.value).toBe('dark')
  })

  test('"Dark theme" stays pressed after closing and reopening the menu', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')

    await page.getByRole('button', { name: 'Open main menu' }).click()
    const dialog = page.getByRole('dialog')
    await dialog
      .getByRole('group', { name: 'Color theme' })
      .getByRole('button', { name: 'Dark theme', exact: true })
      .click()
    await dialog.getByRole('button', { name: 'Close menu' }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Open main menu' }).click()

    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expectPressed(page, 'Dark')
  })
})
