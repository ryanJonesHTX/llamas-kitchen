import type { Page } from '@playwright/test'
import { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS, RECIPE_PAGE_SIZE } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { publishedRecipes, seedRecipe } from './fixtures.ts'
import { disableAutoLoad, pagingName, pagingRecipes, range } from './paging.ts'

// The /recipes list: search, filters, sort and paging, all held in the URL.
// Every test starts from exactly the seed fixtures; the paging tests add more.
test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

// The recipe grid is a <section aria-labelledby="recipes-heading">.
const recipeGridNames = (page: Page) =>
  page
    .getByRole('region', { name: 'Recipes', exact: true })
    .getByRole('heading', { level: 3 })

// By publishedAt. The pending and rejected recipes were created after all of
// these, so sorting by createdAt or skipping the status filter shows them.
const newestFirst = [
  'E2E Pork Chops',
  'E2E Chicken Curry',
  'E2E Beef Burgers',
  'E2E Chicken Tacos',
  'E2E Beef Stew',
]

// The button says "Filters", plus a count badge once any filter is active.
const filtersButton = (page: Page, count: number) =>
  page.getByRole('button', { name: count === 0 ? 'Filters' : `Filters, ${count} active`, exact: true })

// The disclosure's "Clear all" is a button; the empty state's is a link.
const clearAllButton = (page: Page) => page.getByRole('button', { name: 'Clear all', exact: true })
// "More recipes" is a link in the server's HTML and a button once hydrated.
const moreRecipesLink = (page: Page) => page.getByRole('link', { name: 'More recipes', exact: true })
const moreRecipesButton = (page: Page) => page.getByRole('button', { name: 'More recipes', exact: true })
const moreRecipes = (page: Page) => moreRecipesLink(page).or(moreRecipesButton(page))

// The sort button shows the current sort, e.g. "Sort: Newest".
async function sortBy(page: Page, option: 'Newest' | 'Oldest') {
  await page.getByRole('button', { name: /^Sort: / }).click()
  await page.getByRole('menuitem', { name: option }).click()
}

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search recipes' })
const searchResultsFor = (page: Page, q: string) => page.getByText(`Results for “${q}”`, { exact: true })
const clearSearch = (page: Page) => page.getByRole('link', { name: 'Clear search', exact: true })

async function searchFor(page: Page, q: string) {
  await searchBox(page).fill(q)
  await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click()
}

// Matches /recipes with exactly these params, in any order. `true` means the
// param appears once with any value (the opaque cursor).
type ExpectedParams = Record<string, string | string[] | true>

function listingUrl(expected: ExpectedParams = {}) {
  return (url: URL) => {
    if (url.pathname !== '/recipes') return false
    const keys = [...new Set(url.searchParams.keys())].sort()
    if (keys.join('&') !== Object.keys(expected).sort().join('&')) return false
    return Object.entries(expected).every(([key, want]) => {
      const got = url.searchParams.getAll(key)
      if (want === true) return got.length === 1 && got[0] !== ''
      return [want].flat().sort().join('\n') === [...got].sort().join('\n')
    })
  }
}

// Recipe links go to /recipes/<slug>.
async function expectSlugLinks(page: Page, names: string[]) {
  for (const name of names) {
    const { slug } = publishedRecipes.find((r) => r.name === name)!
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/recipes/${slug}`)
  }
}

async function expectNotFound(page: Page, path: string) {
  const response = await page.goto(path)
  expect(response?.status(), path).toBe(404)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
}

test.describe('recipe list', () => {
  test('shows every published recipe, newest first by default', async ({ page }) => {
    await page.goto('/recipes')

    await expect(page).toHaveTitle('Llamas Kitchen - Recipes')
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(moreRecipes(page)).toHaveCount(0)
  })

  test('links each recipe to /recipes/<slug>', async ({ page }) => {
    await page.goto('/recipes')

    await expectSlugLinks(page, newestFirst)
  })

  // The card is the <article> holding the recipe's heading.
  const card = (page: Page, name: string) =>
    page.getByRole('article').filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })

  test('each card shows the total time in hours and minutes', async ({ page }) => {
    await page.goto('/recipes')

    // 20 min prep + 120 min cook.
    await expect(card(page, 'E2E Beef Stew')).toContainText('Total time: 2 hr 20 min')
    // 15 + 20.
    await expect(card(page, 'E2E Chicken Tacos')).toContainText('Total time: 35 min')
  })

  test('each card lists its tags', async ({ page }) => {
    await page.goto('/recipes')

    await expect(card(page, 'E2E Beef Stew').getByRole('listitem')).toHaveText(['beef', 'stew'])
    await expect(card(page, 'E2E Beef Burgers').getByRole('listitem')).toHaveText(['beef'])
  })

  test('a card shows three tags and counts the rest', async ({ page }) => {
    await insertRecipes([
      {
        ...seedRecipe('E2E Chicken Tacos'),
        _id: '65c000000000000000000001',
        name: 'E2E Many Tags',
        slug: 'e2e-many-tags',
        tags: ['one', 'two', 'three', 'four', 'five'],
      },
    ])
    await page.goto('/recipes')

    await expect(card(page, 'E2E Many Tags').getByRole('listitem')).toHaveText(['one', 'two', 'three', '+2 more tags'])
  })

  test('marks the selected sort with aria-current', async ({ page }) => {
    await page.goto('/recipes?sort=oldest')

    await page.getByRole('button', { name: 'Sort: Oldest', exact: true }).click()

    await expect(page.getByRole('menuitem', { name: 'Oldest' })).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('menuitem', { name: 'Newest' })).not.toHaveAttribute('aria-current')
  })

  test('"Clear all" only shows once the URL holds a filter or sort', async ({ page }) => {
    await page.goto('/recipes')
    await expect(clearAllButton(page)).toHaveCount(0)

    await page.goto('/recipes?sort=oldest')
    await expect(clearAllButton(page)).toBeVisible()
  })

  // The pending recipe is tagged beef too.
  test('filters by tag, putting the tag in the URL', async ({ page }) => {
    await page.goto('/recipes')

    await filtersButton(page, 0).click()
    await page.getByRole('checkbox', { name: 'beef' }).click()

    await expect(page).toHaveURL(listingUrl({ tag: 'beef' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Beef Burgers', 'E2E Beef Stew'])
    await expect(page.getByRole('checkbox', { name: 'beef' })).toBeChecked()
  })

  test('selecting several tags shows recipes with any of them', async ({ page }) => {
    await page.goto('/recipes')

    await filtersButton(page, 0).click()
    await page.getByRole('checkbox', { name: 'beef' }).click()
    await expect(page).toHaveURL(listingUrl({ tag: 'beef' }))
    await page.getByRole('checkbox', { name: 'pork' }).click()

    await expect(page).toHaveURL(listingUrl({ tag: ['beef', 'pork'] }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Pork Chops', 'E2E Beef Burgers', 'E2E Beef Stew'])
    await expect(filtersButton(page, 2)).toBeVisible()
  })

  test('filters by total time, putting it in the URL', async ({ page }) => {
    await page.goto('/recipes')
    await filtersButton(page, 0).click()

    await page.getByRole('radio', { name: 'Total Time: > 1 Hour' }).click()
    await expect(page).toHaveURL(listingUrl({ time: 'long' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry', 'E2E Beef Stew'])

    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).click()
    await expect(page).toHaveURL(listingUrl({ time: 'quick' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Pork Chops', 'E2E Beef Burgers', 'E2E Chicken Tacos'])
    await expect(page.getByRole('radio', { name: 'Total Time: ~1 Hour' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Total Time: > 1 Hour' })).not.toBeChecked()
  })

  test('"Clear all" goes back to /recipes and the full list', async ({ page }) => {
    await page.goto('/recipes')
    await filtersButton(page, 0).click()
    await page.getByRole('checkbox', { name: 'chicken' }).click()
    await expect(page).toHaveURL(listingUrl({ tag: 'chicken' }))
    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).click()
    await expect(page).toHaveURL(listingUrl({ tag: 'chicken', time: 'quick' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos'])

    await clearAllButton(page).click()

    await expect(page).toHaveURL(listingUrl())
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(filtersButton(page, 0)).toBeVisible()
  })

  test('sorts by oldest and newest, putting the sort in the URL', async ({ page }) => {
    await page.goto('/recipes')

    await sortBy(page, 'Oldest')
    await expect(page).toHaveURL(listingUrl({ sort: 'oldest' }))
    await expect(recipeGridNames(page)).toHaveText([...newestFirst].reverse())

    // Newest is the default, so it leaves sort out of the URL.
    await sortBy(page, 'Newest')
    await expect(page).toHaveURL(listingUrl())
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })

  test('filter and sort state survives reload, back and forward', async ({ page }) => {
    await page.goto('/recipes')
    await filtersButton(page, 0).click()
    await page.getByRole('checkbox', { name: 'beef' }).click()
    await expect(page).toHaveURL(listingUrl({ tag: 'beef' }))
    await sortBy(page, 'Oldest')
    await expect(page).toHaveURL(listingUrl({ tag: 'beef', sort: 'oldest' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Beef Stew', 'E2E Beef Burgers'])

    await page.reload()
    await expect(page).toHaveURL(listingUrl({ tag: 'beef', sort: 'oldest' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Beef Stew', 'E2E Beef Burgers'])
    await filtersButton(page, 1).click()
    await expect(page.getByRole('checkbox', { name: 'beef' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'chicken' })).not.toBeChecked()

    await page.goBack()
    await expect(page).toHaveURL(listingUrl({ tag: 'beef' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Beef Burgers', 'E2E Beef Stew'])
    await expect(filtersButton(page, 1)).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(listingUrl())
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(filtersButton(page, 0)).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(listingUrl({ tag: 'beef' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Beef Burgers', 'E2E Beef Stew'])
    await expect(filtersButton(page, 1)).toBeVisible()
  })

  test('opening a filtered, sorted URL directly shows that state', async ({ page }) => {
    await page.goto('/recipes?tag=chicken&time=long&sort=oldest')

    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry'])
    await filtersButton(page, 2).click()
    await expect(page.getByRole('checkbox', { name: 'chicken' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Total Time: > 1 Hour' })).toBeChecked()
  })

  test('ignores unknown params', async ({ page }) => {
    const response = await page.goto('/recipes?utm_source=newsletter')

    expect(response?.status()).toBe(200)
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })

  for (const query of [
    'time=x',
    'after=garbage',
    'sort=x',
    'tag=',
    'time=quick&time=long',
    'sort=oldest&sort=oldest',
    'tag=beef&tag=beef',
    'q=chicken&q=curry',
    `q=${'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1)}`,
    `q=${Array.from({ length: MAX_SEARCH_WORDS + 1 }, (_, i) => `w${i}`).join('+')}`,
  ]) {
    test(`responds 404 for ?${query}`, async ({ page }) => {
      await expectNotFound(page, `/recipes?${query}`)
    })
  }

  test('shows an empty state with a "Clear all" link when nothing matches', async ({ page }) => {
    // Pork Chops is the only pork recipe, and it is quick.
    await page.goto('/recipes?tag=pork&time=long')

    await expect(page.getByText('No recipes match these filters.')).toBeVisible()
    await expect(recipeGridNames(page)).toHaveCount(0)
    await expect(moreRecipes(page)).toHaveCount(0)

    await page.getByRole('link', { name: 'Clear all', exact: true }).click()

    await expect(page).toHaveURL(listingUrl())
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(page.getByText('No recipes match these filters.')).toHaveCount(0)
  })
})

// Seed matches: "chicken" is in the Tacos and Curry names (and the hidden
// rejected Chicken Bake); "thighs" is a Tacos ingredient.
test.describe('recipe search', () => {
  test('searching puts q in the URL, filters by word prefix and shows the query', async ({ page }) => {
    await page.goto('/recipes')

    await searchFor(page, 'chic thi')

    await expect(page).toHaveURL(listingUrl({ q: 'chic thi' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos'])
    await expect(searchResultsFor(page, 'chic thi')).toBeVisible()
    await expect(searchBox(page)).toHaveValue('chic thi')
  })

  test('matches ingredients and tags as well as names, never hidden recipes', async ({ page }) => {
    await page.goto('/recipes?q=coconut')
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry'])

    await page.goto('/recipes?q=curry')
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry'])

    await page.goto('/recipes?q=chicken')
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry', 'E2E Chicken Tacos'])
  })

  test('ignores accents', async ({ page }) => {
    await insertRecipes([
      {
        ...seedRecipe('E2E Chicken Tacos'),
        _id: '65c000000000000000000001',
        name: 'E2E Crème Brûlée',
        slug: 'e2e-creme-brulee',
      },
    ])

    await page.goto('/recipes?q=creme+brulee')

    await expect(recipeGridNames(page)).toHaveText(['E2E Crème Brûlée'])
  })

  test('a new search keeps the filters and sort', async ({ page }) => {
    await page.goto('/recipes?tag=chicken&tag=pork&sort=oldest')

    await searchFor(page, 'chicken')

    await expect(page).toHaveURL(listingUrl({ tag: ['chicken', 'pork'], sort: 'oldest', q: 'chicken' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos', 'E2E Chicken Curry'])
  })

  test('changing a filter or the sort keeps the search', async ({ page }) => {
    await page.goto('/recipes?q=chicken')

    await filtersButton(page, 0).click()
    await page.getByRole('radio', { name: 'Total Time: > 1 Hour' }).click()
    await expect(page).toHaveURL(listingUrl({ q: 'chicken', time: 'long' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry'])

    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).click()
    await expect(page).toHaveURL(listingUrl({ q: 'chicken', time: 'quick' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos'])

    await sortBy(page, 'Oldest')
    await expect(page).toHaveURL(listingUrl({ q: 'chicken', time: 'quick', sort: 'oldest' }))
    await expect(searchResultsFor(page, 'chicken')).toBeVisible()
    await expect(searchBox(page)).toHaveValue('chicken')
  })

  test('"Clear search" keeps the filters and sort', async ({ page }) => {
    await page.goto('/recipes?q=chicken&tag=chicken&tag=beef&sort=oldest')
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos', 'E2E Chicken Curry'])

    await clearSearch(page).click()

    await expect(page).toHaveURL(listingUrl({ tag: ['chicken', 'beef'], sort: 'oldest' }))
    await expect(recipeGridNames(page)).toHaveText([
      'E2E Beef Stew',
      'E2E Chicken Tacos',
      'E2E Beef Burgers',
      'E2E Chicken Curry',
    ])
    await expect(page.getByText(/^Results for/)).toHaveCount(0)
    await expect(searchBox(page)).toHaveValue('')
  })

  test('a blank search shows every recipe', async ({ page }) => {
    await page.goto('/recipes')

    await searchFor(page, '   ')

    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(page.getByText(/^Results for/)).toHaveCount(0)
    await expect(clearSearch(page)).toHaveCount(0)
  })

  test('shows an empty state when nothing matches the search', async ({ page }) => {
    await page.goto('/recipes')
    await searchFor(page, 'zucchini')

    await expect(page.getByText('No recipes match this search.')).toBeVisible()
    await expect(searchResultsFor(page, 'zucchini')).toBeVisible()
    await expect(recipeGridNames(page)).toHaveCount(0)

    await page.getByRole('link', { name: 'Clear all', exact: true }).click()

    await expect(page).toHaveURL(listingUrl())
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })

  test('the empty state names the filters when they are set too', async ({ page }) => {
    await page.goto('/recipes?q=chicken&tag=pork')

    await expect(page.getByText('No recipes match this search and these filters.')).toBeVisible()
  })

  test('punctuation alone is a search that matches nothing', async ({ page }) => {
    const response = await page.goto('/recipes?q=%21%21%21')

    expect(response?.status()).toBe(200)
    await expect(page.getByText('No recipes match this search.')).toBeVisible()
  })

  // Only the form: the results stream in through Suspense, which needs
  // JavaScript to replace the skeleton.
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('the search form submits the search, keeping the filters and sort', async ({ page }) => {
      await page.goto('/recipes?time=quick&sort=oldest')

      await searchFor(page, 'beef')

      await expect(page).toHaveURL(listingUrl({ time: 'quick', sort: 'oldest', q: 'beef' }))
      await expect(searchBox(page)).toHaveValue('beef')
    })
  })
})

// The server renders the first page; with JavaScript, "More recipes" is a
// button that appends the next page in place, leaving the URL alone. More in
// infinite-scroll.spec.ts.
test.describe('recipe list paging', () => {
  const PAGING_COUNT = RECIPE_PAGE_SIZE + 3
  // Newest first: the seeds, then the paging recipes by _id descending.
  const firstPagePaging = RECIPE_PAGE_SIZE - newestFirst.length
  const firstPage = [...newestFirst, ...range(PAGING_COUNT, PAGING_COUNT - firstPagePaging + 1).map(pagingName)]
  const secondPage = range(PAGING_COUNT - firstPagePaging, 1).map(pagingName)

  test.beforeEach(async ({ page }) => {
    await insertRecipes(pagingRecipes(PAGING_COUNT))
    await disableAutoLoad(page)
  })

  test('"More recipes" appends the next page without changing the URL, and the last page has no control', async ({
    page,
  }) => {
    await page.goto('/recipes')
    await expect(recipeGridNames(page)).toHaveText(firstPage)

    await moreRecipesButton(page).click()

    await expect(recipeGridNames(page)).toHaveText([...firstPage, ...secondPage])
    await expect(page).toHaveURL(listingUrl())
    await expect(moreRecipes(page)).toHaveCount(0)
  })

  test('"More recipes" keeps the filters and sort', async ({ page }) => {
    await page.goto('/recipes?tag=paging&time=quick&sort=oldest')
    await expect(recipeGridNames(page)).toHaveText(range(1, RECIPE_PAGE_SIZE).map(pagingName))

    await moreRecipesButton(page).click()

    await expect(recipeGridNames(page)).toHaveText(range(1, PAGING_COUNT).map(pagingName))
    await expect(page).toHaveURL(listingUrl({ tag: 'paging', time: 'quick', sort: 'oldest' }))
    await expect(moreRecipes(page)).toHaveCount(0)
  })

  test('"More recipes" keeps the search, and a new search starts again at its first page', async ({ page }) => {
    await page.goto('/recipes?q=e2e+paging')
    await expect(recipeGridNames(page)).toHaveText(range(PAGING_COUNT, PAGING_COUNT - RECIPE_PAGE_SIZE + 1).map(pagingName))

    await moreRecipesButton(page).click()
    await expect(recipeGridNames(page)).toHaveText(range(PAGING_COUNT, 1).map(pagingName))
    await expect(page).toHaveURL(listingUrl({ q: 'e2e paging' }))

    await searchFor(page, 'paging')
    await expect(page).toHaveURL(listingUrl({ q: 'paging' }))
    await expect(recipeGridNames(page)).toHaveText(range(PAGING_COUNT, PAGING_COUNT - RECIPE_PAGE_SIZE + 1).map(pagingName))
    await expect(moreRecipesButton(page)).toBeVisible()
  })

  test('changing a filter or the sort starts again at the first page', async ({ page }) => {
    await page.goto('/recipes')
    await moreRecipesButton(page).click()
    await expect(recipeGridNames(page)).toHaveText([...firstPage, ...secondPage])

    await filtersButton(page, 0).click()
    await page.getByRole('radio', { name: 'Total Time: > 1 Hour' }).click()
    await expect(page).toHaveURL(listingUrl({ time: 'long' }))
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Curry', 'E2E Beef Stew'])

    await page.goto('/recipes')
    await moreRecipesButton(page).click()
    await expect(recipeGridNames(page)).toHaveText([...firstPage, ...secondPage])

    // Oldest first: the paging recipes by _id ascending, then the seeds.
    await sortBy(page, 'Oldest')
    await expect(page).toHaveURL(listingUrl({ sort: 'oldest' }))
    await expect(recipeGridNames(page)).toHaveText(range(1, RECIPE_PAGE_SIZE).map(pagingName))
    await expect(moreRecipesButton(page)).toBeVisible()
  })

  // The results stream in through Suspense, which needs JavaScript to show
  // them, so these read the server's HTML, hidden content included.
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    const hiddenGridNames = (page: Page) =>
      page
        .getByRole('region', { name: 'Recipes', exact: true, includeHidden: true })
        .getByRole('heading', { level: 3, includeHidden: true })

    test('"More recipes" is a link to the next page, keeping the filters and sort', async ({ page }) => {
      await page.goto('/recipes?tag=paging&time=quick&sort=oldest')
      await expect(page.getByRole('button', { name: 'More recipes', exact: true, includeHidden: true })).toHaveCount(0)

      const href = await page.getByRole('link', { name: 'More recipes', exact: true, includeHidden: true }).getAttribute('href')
      const next = new URL(href!, page.url())
      expect(listingUrl({ tag: 'paging', time: 'quick', sort: 'oldest', after: true })(next), href!).toBe(true)

      await page.goto(href!)
      await expect(hiddenGridNames(page)).toHaveText(range(RECIPE_PAGE_SIZE + 1, PAGING_COUNT).map(pagingName))
      await expect(page.getByRole('link', { name: 'More recipes', exact: true, includeHidden: true })).toHaveCount(0)
    })
  })
})
