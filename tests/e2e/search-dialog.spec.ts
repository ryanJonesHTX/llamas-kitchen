import type { Page } from '@playwright/test'
import type { Request } from '@playwright/test'
import { MAX_SEARCH_WORDS } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { disconnect, reseed } from './db.ts'
import { rejectedRecipe, seedRecipe } from './fixtures.ts'

// The header's search dialog: its triggers, the shortcut, live results from
// /api/search, keyboard use and its states. "chic" matches the two published
// chicken recipes, and the rejected "E2E Rejected Chicken Bake" too.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const curry = seedRecipe('E2E Chicken Curry')
const tacos = seedRecipe('E2E Chicken Tacos')

// The desktop and phone triggers both render; only one is visible.
const trigger = (page: Page) =>
  page.getByRole('button', { name: 'Search recipes', exact: true }).filter({ visible: true })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Search recipes' })
const input = (page: Page) => dialog(page).getByRole('combobox', { name: 'Search recipes' })
// A result's name is the recipe name followed by its tags.
const result = (page: Page, name: string) => dialog(page).getByRole('option', { name: new RegExp(`^${name}`) })
// The visible message; the live region (role status) repeats it for screen readers.
const message = (page: Page) => dialog(page).getByRole('paragraph')
const seeAll = (page: Page, text: string) => dialog(page).getByRole('option', { name: `See all results for “${text}”` })

const openWithTrigger = async (page: Page) => {
  await trigger(page).click()
  await expect(input(page)).toBeFocused()
}

const search = async (page: Page, text: string) => {
  await input(page).fill(text)
  await expect(seeAll(page, text)).toBeVisible()
}

// Waits for hydration: the trigger learns the platform's shortcut after mount.
const shortcut = async (page: Page) => {
  await expect(trigger(page)).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+K$/)
  return (await trigger(page).getAttribute('aria-keyshortcuts'))!
}

test.describe('desktop', () => {
  test('the trigger shows the shortcut, opens the dialog and focuses its input', async ({ page }) => {
    await page.goto('/')
    const keys = await shortcut(page)
    await expect(trigger(page)).toContainText(keys === 'Meta+K' ? '⌘K' : 'Ctrl K')

    await openWithTrigger(page)

    // The dialog element has no box of its own; its panel is position: fixed.
    await expect(message(page)).toHaveText('Search recipes by name, ingredient or tag.')
  })

  test('the shortcut opens the dialog, even from inside a form field, and again does no harm', async ({ page }) => {
    await page.goto('/recipes')
    const keys = await shortcut(page)
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('beef')

    await page.keyboard.press(keys)

    await expect(input(page)).toBeFocused()
    await input(page).fill('chic')
    await page.keyboard.press(keys)
    await expect(input(page)).toBeFocused()
    await expect(input(page)).toHaveValue('chic')
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('beef')
  })

  test('typing lists the published matches, name matches first and newest first, and announces the count', async ({
    page,
  }) => {
    await page.goto('/')
    await openWithTrigger(page)

    await search(page, 'chic')

    await expect(dialog(page).getByRole('option')).toHaveText([
      new RegExp(`^${curry.name}`),
      new RegExp(`^${tacos.name}`),
      'See all results for “chic”',
    ])
    await expect(result(page, rejectedRecipe.name)).toHaveCount(0)
    await expect(dialog(page).getByRole('status')).toHaveText('2 results')
  })

  test('arrow keys move the highlight and Enter opens that recipe', async ({ page }) => {
    await page.goto('/')
    await openWithTrigger(page)
    await search(page, 'chic')

    // The first row is highlighted as results arrive.
    await expect(input(page)).toHaveAttribute('aria-activedescendant', (await result(page, curry.name).getAttribute('id'))!)
    await input(page).press('ArrowDown')
    await expect(input(page)).toHaveAttribute('aria-activedescendant', (await result(page, tacos.name).getAttribute('id'))!)
    await input(page).press('Enter')

    await expect(page).toHaveURL(`/recipes/${tacos.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: tacos.name })).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
  })

  test('Enter with no row highlighted lists every match on /recipes', async ({ page }) => {
    // Results never arrive, so no row is highlighted.
    await page.route('**/api/search?*', () => {})
    await page.goto('/')
    await openWithTrigger(page)
    await input(page).fill('chic')
    await expect(message(page)).toHaveText('Searching…')

    await input(page).press('Enter')

    await expect(page).toHaveURL('/recipes?q=chic')
    await expect(page.getByText('Results for “chic”')).toBeVisible()
  })

  test('Enter while a newer search loads lists every match, even with a row highlighted before', async ({ page }) => {
    // The search for "chick" never answers.
    await page.route('**/api/search?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('q') === 'chick') return
      await route.continue()
    })
    await page.goto('/')
    await openWithTrigger(page)
    await search(page, 'chic')
    await input(page).press('ArrowDown')
    await expect(input(page)).toHaveAttribute('aria-activedescendant', (await result(page, tacos.name).getAttribute('id'))!)

    const newer = page.waitForRequest((request) => request.url().includes('q=chick'))
    await input(page).press('k')
    await newer
    await input(page).press('Enter')

    await expect(page).toHaveURL('/recipes?q=chick')
    await expect(page.getByText('Results for “chick”')).toBeVisible()
  })

  test(`more than ${MAX_SEARCH_WORDS} words aren't searched, say so, and Enter does nothing`, async ({ page }) => {
    const searched: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/search')) searched.push(request.url())
    })
    await page.goto('/')
    await openWithTrigger(page)
    const text = Array.from({ length: MAX_SEARCH_WORDS + 1 }, (_, i) => `w${i}`).join(' ')

    await input(page).fill(text)

    await expect(message(page)).toHaveText(`Use at most ${MAX_SEARCH_WORDS} words.`)
    await expect(dialog(page).getByRole('status')).toHaveText(`Use at most ${MAX_SEARCH_WORDS} words.`)
    await input(page).press('Enter')
    await expect(input(page)).toBeFocused()
    await expect(page).toHaveURL('/')
    // Back to a valid search, which is sent; the long one never was.
    await search(page, 'chic')
    expect(searched.filter((url) => url.includes('w6'))).toEqual([])
  })

  test('the "See all results" row lists every match on /recipes', async ({ page }) => {
    await page.goto('/')
    await openWithTrigger(page)
    await search(page, 'chic')

    await seeAll(page, 'chic').click()

    await expect(page).toHaveURL('/recipes?q=chic')
    await expect(page.getByText('Results for “chic”')).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
  })

  test('Escape closes the dialog and returns focus to the trigger', async ({ page }) => {
    await page.goto('/')
    await openWithTrigger(page)
    await search(page, 'chic')

    await page.keyboard.press('Escape')

    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })

  test('says when nothing matches, with no rows', async ({ page }) => {
    await page.goto('/')
    await openWithTrigger(page)

    await input(page).fill('zucchini')

    await expect(message(page)).toHaveText('No recipes match “zucchini”.')
    await expect(dialog(page).getByRole('option')).toHaveCount(0)
    await expect(dialog(page).getByRole('status')).toHaveText('No recipes match “zucchini”.')
  })

  test('says when there were too many searches', async ({ page }) => {
    await page.route('**/api/search?*', (route) =>
      route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { error: 'Too many searches' } })
    )
    await page.goto('/')
    await openWithTrigger(page)

    await input(page).fill('chic')

    await expect(message(page)).toHaveText('Too many searches, try again in a moment.')
    await expect(dialog(page).getByRole('status')).toHaveText('Too many searches, try again in a moment.')
  })

  test('says when the search failed', async ({ page }) => {
    await page.route('**/api/search?*', (route) => route.fulfill({ status: 500, body: 'Internal Server Error' }))
    await page.goto('/')
    await openWithTrigger(page)

    await input(page).fill('chic')

    await expect(message(page)).toHaveText('Search failed. Try again.')
  })

  test('a slow response for older text never replaces newer results', async ({ page }) => {
    await page.route('**/api/search?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('q') === 'chic') {
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      // The dialog aborts the older request, so continuing it can fail.
      await route.continue().catch(() => {})
    })
    await page.goto('/')
    await openWithTrigger(page)

    const isOlder = (request: Request) => request.url().includes('q=chic')
    const older = page.waitForRequest(isOlder)
    // Settles either way: aborted by the dialog, or answered after the delay.
    const olderSettled = Promise.race([page.waitForEvent('requestfailed', isOlder), page.waitForEvent('requestfinished', isOlder)])
    await input(page).fill('chic')
    await older
    await search(page, 'pork')
    await olderSettled

    await expect(dialog(page).getByRole('option')).toHaveText([/^E2E Pork Chops/, 'See all results for “pork”'])
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: false })

  test('the icon trigger opens the dialog, and a result opens that recipe', async ({ page }) => {
    await page.goto('/')
    await openWithTrigger(page)
    await search(page, 'chic')

    await result(page, curry.name).click()

    await expect(page).toHaveURL(`/recipes/${curry.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: curry.name })).toBeVisible()
  })

  test('the shortcut closes the open mobile menu, so only the search dialog is open', async ({ page }) => {
    // The shortcut hint is on the desktop trigger only.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const keys = await shortcut(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Open main menu' }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Close menu' })).toBeVisible()

    await page.keyboard.press(keys)

    await expect(input(page)).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveCount(0)
  })

  test('Close search closes the dialog and returns focus to the trigger', async ({ page }) => {
    await page.goto('/')
    await openWithTrigger(page)

    await dialog(page).getByRole('button', { name: 'Close search' }).click()

    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })
})
