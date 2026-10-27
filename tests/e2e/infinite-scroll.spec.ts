import type { Page, Route } from '@playwright/test'
import { RECIPE_PAGE_SIZE } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import {
  apiRequests,
  disableAutoLoad,
  endOfList,
  moreRecipes,
  moreRecipesButton,
  newestFirst,
  openListing,
  pagingName,
  pagingRecipes,
  range,
  recipeGridNames,
  renderedFrames,
} from './paging.ts'

// The /recipes grid appends further pages in place from /api/recipes: when
// the end of the grid scrolls into view, or from the "More recipes" button.
// The URL stays the same. recipe-list.spec.ts covers the button's basics,
// resetting on a new query and the link without JavaScript.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

// Three pages: the seeds and the paging recipes by _id descending.
const PAGING_COUNT = 2 * RECIPE_PAGE_SIZE + 3
const everyRecipe = [...newestFirst, ...range(PAGING_COUNT, 1).map(pagingName)]
const firstPage = everyRecipe.slice(0, RECIPE_PAGE_SIZE)
const firstTwoPages = everyRecipe.slice(0, 2 * RECIPE_PAGE_SIZE)
const lastPageSize = everyRecipe.length - 2 * RECIPE_PAGE_SIZE

const tryAgain = (page: Page) => page.getByRole('button', { name: 'Try again', exact: true })
const loadFailed = (page: Page) => page.getByText("Couldn't load more recipes.", { exact: true })
// The visually hidden live region; only its text is checked.
const announcement = (page: Page) => page.getByRole('status').filter({ hasText: /^Loaded \d+ more recipes$/ })
// The same region whatever it holds, empty included.
const gridStatus = (page: Page) => page.getByRole('region', { name: 'Recipes', exact: true }).getByRole('status')

const scrollToEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
const scrollToTop = (page: Page) => page.evaluate(() => window.scrollTo(0, 0))

test.describe('infinite scroll', () => {
  test.beforeEach(async () => {
    await insertRecipes(pagingRecipes(PAGING_COUNT))
  })

  test('scrolling to the end loads each next page in order, then says that is every recipe', async ({ page }) => {
    const requests = apiRequests(page)
    await openListing(page, '/recipes')
    await expect(recipeGridNames(page)).toHaveText(firstPage)
    await expect(endOfList(page)).toHaveCount(0)

    await scrollToEnd(page)
    await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
    await scrollToEnd(page)
    await expect(recipeGridNames(page)).toHaveText(everyRecipe)

    await expect(endOfList(page)).toBeVisible()
    await expect(moreRecipes(page)).toHaveCount(0)
    await expect(page).toHaveURL('/recipes')
    // One request per page, each continuing from a different cursor.
    expect(requests).toHaveLength(2)
    expect(new Set(requests.map((url) => url.searchParams.get('after'))).size).toBe(2)
  })

  test('"More recipes" appends the next page, announces how many loaded and keeps focus', async ({ page }) => {
    await disableAutoLoad(page)
    await openListing(page, '/recipes')

    await moreRecipesButton(page).focus()
    await page.keyboard.press('Enter')

    await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
    await expect(announcement(page)).toHaveText(`Loaded ${RECIPE_PAGE_SIZE} more recipes`)
    await expect(moreRecipesButton(page)).toBeFocused()
    await expect(page).toHaveURL('/recipes')

    await page.keyboard.press('Enter')

    await expect(recipeGridNames(page)).toHaveText(everyRecipe)
    await expect(announcement(page)).toHaveText(`Loaded ${lastPageSize} more recipes`)
    await expect(endOfList(page)).toBeVisible()
    await expect(moreRecipes(page)).toHaveCount(0)
  })

  test('"More recipes" is disabled while a page loads, and only one request is made at a time', async ({ page }) => {
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/recipes**', async (route) => {
      await released
      await route.continue()
    })
    const requests = apiRequests(page)
    await openListing(page, '/recipes')

    await scrollToEnd(page)
    await expect(moreRecipesButton(page)).toBeDisabled()
    // Scrolling away and back, or clicking, while it loads asks for nothing more.
    await scrollToTop(page)
    await scrollToEnd(page)
    await moreRecipesButton(page).click({ force: true })
    await renderedFrames(page)
    expect(requests).toHaveLength(1)

    release()

    await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
    await expect(moreRecipesButton(page)).toBeEnabled()
    expect(requests).toHaveLength(1)
  })

  const failures: [string, (route: Route) => Promise<void>][] = [
    ['an error response', (route) => route.fulfill({ status: 500, body: 'Internal Server Error' })],
    ['a network error', (route) => route.abort()],
  ]

  for (const [failure, fail] of failures) {
    test(`after ${failure}, the grid says so and "Try again" loads the same page`, async ({ page }) => {
      let calls = 0
      await page.route('**/api/recipes**', (route) => (++calls === 1 ? fail(route) : route.continue()))
      const requests = apiRequests(page)
      await disableAutoLoad(page)
      await openListing(page, '/recipes')

      await moreRecipesButton(page).click()

      await expect(loadFailed(page)).toBeVisible()
      await expect(recipeGridNames(page)).toHaveText(firstPage)

      await tryAgain(page).click()

      await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
      await expect(loadFailed(page)).toHaveCount(0)
      await expect(tryAgain(page)).toHaveCount(0)
      expect(requests).toHaveLength(2)
      expect(requests[1].searchParams.get('after')).toBe(requests[0].searchParams.get('after'))
    })
  }

  test('after a failed load, scrolling to the end again asks for nothing until "Try again"', async ({ page }) => {
    let calls = 0
    await page.route('**/api/recipes**', (route) =>
      ++calls === 1 ? route.fulfill({ status: 500, body: 'Internal Server Error' }) : route.continue()
    )
    const requests = apiRequests(page)
    await openListing(page, '/recipes')

    await scrollToEnd(page)
    await expect(loadFailed(page)).toBeVisible()
    await scrollToTop(page)
    await scrollToEnd(page)
    await expect(tryAgain(page)).toBeInViewport()
    expect(requests).toHaveLength(1)

    await tryAgain(page).click()

    await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
    expect(requests).toHaveLength(2)
  })

  test('the next page request carries the search, filters and sort', async ({ page }) => {
    await disableAutoLoad(page)
    await openListing(page, '/recipes?q=paging&tag=paging&time=quick&sort=oldest')
    await expect(recipeGridNames(page)).toHaveText(range(1, RECIPE_PAGE_SIZE).map(pagingName))

    const request = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/recipes')
    await moreRecipesButton(page).click()
    const { searchParams } = new URL((await request).url())

    expect([...new Set(searchParams.keys())].sort()).toEqual(['after', 'q', 'sort', 'tag', 'time'])
    expect(searchParams.getAll('q')).toEqual(['paging'])
    expect(searchParams.getAll('tag')).toEqual(['paging'])
    expect(searchParams.getAll('time')).toEqual(['quick'])
    expect(searchParams.getAll('sort')).toEqual(['oldest'])
    expect(searchParams.getAll('after')).toEqual([expect.stringMatching(/.+/)])
    await expect(recipeGridNames(page)).toHaveText(range(1, 2 * RECIPE_PAGE_SIZE).map(pagingName))
    await expect(page).toHaveURL('/recipes?q=paging&tag=paging&time=quick&sort=oldest')
  })

  test('opening a page by its cursor shows that page and appends from there', async ({ page, request }) => {
    // The cursor after the first page, as "More recipes" links to it.
    const response = await request.get('/api/recipes', { headers: { 'x-forwarded-for': '203.0.113.200' } })
    const { nextCursor } = (await response.json()) as { nextCursor: string }
    const path = `/recipes?after=${encodeURIComponent(nextCursor)}`
    await disableAutoLoad(page)

    await openListing(page, path)
    await expect(recipeGridNames(page)).toHaveText(firstTwoPages.slice(RECIPE_PAGE_SIZE))

    await moreRecipesButton(page).click()

    await expect(recipeGridNames(page)).toHaveText(everyRecipe.slice(RECIPE_PAGE_SIZE))
    await expect(moreRecipes(page)).toHaveCount(0)
    await expect(page).toHaveURL(path)
  })
})

test('when every recipe fits on the first page there is no control and no end line', async ({ page }) => {
  const requests = apiRequests(page)
  await page.goto('/recipes')
  await expect(recipeGridNames(page)).toHaveText(newestFirst)

  await scrollToEnd(page)

  await expect(moreRecipes(page)).toHaveCount(0)
  await expect(endOfList(page)).toHaveCount(0)
  expect(requests).toHaveLength(0)
})

test.describe('announcements and the end line', () => {
  test.beforeEach(async ({ page }) => {
    await disableAutoLoad(page)
  })

  test('each append is announced, even when it loads as many recipes as the last', async ({ page }) => {
    // Three full pages.
    await insertRecipes(pagingRecipes(3 * RECIPE_PAGE_SIZE - newestFirst.length))
    let calls = 0
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/recipes**', async (route) => {
      if (++calls === 2) await released
      await route.continue()
    })
    await openListing(page, '/recipes')

    await moreRecipesButton(page).click()
    await expect(gridStatus(page)).toHaveText(`Loaded ${RECIPE_PAGE_SIZE} more recipes`)

    await moreRecipesButton(page).click()
    await expect(gridStatus(page)).toHaveText('')

    release()

    await expect(gridStatus(page)).toHaveText(`Loaded ${RECIPE_PAGE_SIZE} more recipes`)
    await expect(endOfList(page)).toBeVisible()
  })

  test('one recipe appended is announced in the singular', async ({ page }) => {
    await insertRecipes(pagingRecipes(RECIPE_PAGE_SIZE - newestFirst.length + 1))
    await openListing(page, '/recipes')

    await moreRecipesButton(page).click()

    await expect(gridStatus(page)).toHaveText('Loaded 1 more recipe')
    await expect(endOfList(page)).toBeVisible()
  })

  test('a last page with no recipes still ends the list', async ({ page }) => {
    await insertRecipes(pagingRecipes(RECIPE_PAGE_SIZE))
    await page.route('**/api/recipes**', (route) => route.fulfill({ json: { recipes: [], nextCursor: null } }))
    await openListing(page, '/recipes')

    await moreRecipesButton(page).click()

    await expect(endOfList(page)).toBeVisible()
    await expect(moreRecipes(page)).toHaveCount(0)
    await expect(recipeGridNames(page)).toHaveCount(RECIPE_PAGE_SIZE)
  })
})
