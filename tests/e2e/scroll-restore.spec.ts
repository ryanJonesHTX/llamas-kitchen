import type { Page } from '@playwright/test'
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

// Back or Forward to a /recipes listing shows the pages already loaded there,
// scrolled to where it was, and loads on from there. A fresh visit to the
// same URL starts at the first page. "More recipes" does the loading here,
// so each load is one click (auto-load is off).

test.beforeEach(async ({ page }) => {
  await reseed()
  await insertRecipes(pagingRecipes(PAGING_COUNT))
  await disableAutoLoad(page)
})

test.afterAll(async () => {
  await disconnect()
})

// Three pages: the seeds and the paging recipes by _id descending.
const PAGING_COUNT = 2 * RECIPE_PAGE_SIZE + 3
const everyRecipe = [...newestFirst, ...range(PAGING_COUNT, 1).map(pagingName)]
const firstPage = everyRecipe.slice(0, RECIPE_PAGE_SIZE)
const firstTwoPages = everyRecipe.slice(0, 2 * RECIPE_PAGE_SIZE)
// Oldest first, the paging recipes (published before every seed) by _id ascending.
const oldestFirstTwoPages = range(1, 2 * RECIPE_PAGE_SIZE).map(pagingName)

// The browser restores to roughly where it was; fonts and images may shift it slightly.
const SCROLL_TOLERANCE = 50

const recipeCardLink = (page: Page, name: string) =>
  page.getByRole('region', { name: 'Recipes', exact: true }).getByRole('link', { name, exact: true })
const recipeHeading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const globalNavLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name, exact: true })
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

async function sortBy(page: Page, option: 'Newest' | 'Oldest') {
  await page.getByRole('button', { name: /^Sort: / }).click()
  await page.getByRole('menuitem', { name: option }).click()
}

// Clicks "More recipes" and waits for the grid to hold these recipes.
async function loadMore(page: Page, expected: string[]) {
  await moreRecipesButton(page).click()
  await expect(recipeGridNames(page)).toHaveText(expected)
}

// Scrolls the named card into view, notes the scroll position and opens it.
async function openCard(page: Page, name: string): Promise<number> {
  const card = recipeCardLink(page, name)
  await card.scrollIntoViewIfNeeded()
  const scrolledTo = await scrollY(page)
  await card.click()
  await expect(recipeHeading(page, name)).toBeVisible()
  return scrolledTo
}

async function expectScrolledNear(page: Page, expected: number) {
  await expect.poll(() => scrollY(page)).toBeGreaterThan(expected - SCROLL_TOLERANCE)
  await expect.poll(() => scrollY(page)).toBeLessThan(expected + SCROLL_TOLERANCE)
}

test('Back from a recipe restores every page loaded, the end line and the scroll position, without refetching', async ({
  page,
}) => {
  const requests = apiRequests(page)
  await openListing(page, '/recipes')
  await loadMore(page, firstTwoPages)
  await loadMore(page, everyRecipe)
  await expect(endOfList(page)).toBeVisible()
  // A card on the second page, well down the grid.
  const clicked = everyRecipe[RECIPE_PAGE_SIZE + 6]
  const scrolledTo = await openCard(page, clicked)
  expect(scrolledTo).toBeGreaterThan(0)
  const requestsBefore = requests.length

  await page.goBack()

  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(everyRecipe)
  await expect(endOfList(page)).toBeVisible()
  await expect(moreRecipes(page)).toHaveCount(0)
  await expect(recipeCardLink(page, clicked)).toBeInViewport()
  await expectScrolledNear(page, scrolledTo)
  await renderedFrames(page)
  expect(requests).toHaveLength(requestsBefore)
})

test('Back restores the scroll position itself, without the browser restoring it', async ({ page }) => {
  await page.addInitScript(() => {
    window.history.scrollRestoration = 'manual'
  })
  await openListing(page, '/recipes')
  await loadMore(page, firstTwoPages)
  await loadMore(page, everyRecipe)
  const clicked = everyRecipe[RECIPE_PAGE_SIZE + 6]
  const scrolledTo = await openCard(page, clicked)

  await page.goBack()

  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(everyRecipe)
  await expect(recipeCardLink(page, clicked)).toBeInViewport()
  await expectScrolledNear(page, scrolledTo)
})

test('after Back restores the loaded pages, "More recipes" appends the next page in order', async ({ page }) => {
  const requests = apiRequests(page)
  await openListing(page, '/recipes')
  await loadMore(page, firstTwoPages)
  await openCard(page, firstTwoPages[RECIPE_PAGE_SIZE + 2])
  const requestsBefore = requests.length

  await page.goBack()

  await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
  await expect(moreRecipesButton(page)).toBeVisible()
  await expect(endOfList(page)).toHaveCount(0)
  await renderedFrames(page)
  expect(requests).toHaveLength(requestsBefore)

  await loadMore(page, everyRecipe)

  await expect(endOfList(page)).toBeVisible()
  expect(requests).toHaveLength(requestsBefore + 1)
  // It continues from the cursor after the second page, not from the first page's.
  expect(requests.at(-1)!.searchParams.get('after')).not.toBe(requests[0].searchParams.get('after'))
})

test('Forward to a listing restores the pages loaded there and the scroll position', async ({ page }) => {
  const requests = apiRequests(page)
  await page.goto('/')
  await globalNavLink(page, 'Recipes').click()
  await expect(page).toHaveURL('/recipes')
  await expect(moreRecipesButton(page)).toBeVisible()
  await loadMore(page, firstTwoPages)
  const card = recipeCardLink(page, firstTwoPages[RECIPE_PAGE_SIZE + 6])
  await card.scrollIntoViewIfNeeded()
  const scrolledTo = await scrollY(page)

  await page.goBack()
  await expect(page).toHaveURL('/')
  const requestsBefore = requests.length
  await page.goForward()

  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
  await expect(moreRecipesButton(page)).toBeVisible()
  await expect(card).toBeInViewport()
  await expectScrolledNear(page, scrolledTo)
  await renderedFrames(page)
  expect(requests).toHaveLength(requestsBefore)
})

test('the header Recipes link starts the listing again at the first page, and Back still restores the old one', async ({
  page,
}) => {
  await openListing(page, '/recipes')
  await loadMore(page, firstTwoPages)
  const clicked = firstTwoPages[RECIPE_PAGE_SIZE + 2]
  await openCard(page, clicked)

  await globalNavLink(page, 'Recipes').click()

  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(firstPage)
  await expect(moreRecipesButton(page)).toBeVisible()
  await expect(endOfList(page)).toHaveCount(0)

  await page.goBack()
  await expect(recipeHeading(page, clicked)).toBeVisible()
  await page.goBack()

  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(firstTwoPages)
})

test('a fresh visit to the same URL starts at the first page', async ({ page }) => {
  await openListing(page, '/recipes')
  await loadMore(page, firstTwoPages)

  await openListing(page, '/recipes')

  await expect(recipeGridNames(page)).toHaveText(firstPage)
  await expect(endOfList(page)).toHaveCount(0)
})

test('each listing restores its own pages: newest and oldest never mix', async ({ page }) => {
  await openListing(page, '/recipes')
  await loadMore(page, firstTwoPages)
  await sortBy(page, 'Oldest')
  await expect(page).toHaveURL('/recipes?sort=oldest')
  await expect(recipeGridNames(page)).toHaveText(oldestFirstTwoPages.slice(0, RECIPE_PAGE_SIZE))
  await loadMore(page, oldestFirstTwoPages)
  await openCard(page, oldestFirstTwoPages[RECIPE_PAGE_SIZE + 2])

  await page.goBack()
  await expect(page).toHaveURL('/recipes?sort=oldest')
  await expect(recipeGridNames(page)).toHaveText(oldestFirstTwoPages)

  await page.goBack()
  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(firstTwoPages)

  await page.goForward()
  await expect(page).toHaveURL('/recipes?sort=oldest')
  await expect(recipeGridNames(page)).toHaveText(oldestFirstTwoPages)
})

test('Back shows the first page as usual when nothing more was loaded', async ({ page }) => {
  const requests = apiRequests(page)
  await openListing(page, '/recipes')
  await openCard(page, firstPage[3])

  await page.goBack()

  await expect(page).toHaveURL('/recipes')
  await expect(recipeGridNames(page)).toHaveText(firstPage)
  await expect(moreRecipesButton(page)).toBeVisible()
  await expect(endOfList(page)).toHaveCount(0)
  await renderedFrames(page)
  expect(requests).toHaveLength(0)
})
