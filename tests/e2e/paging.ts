import type { Page } from '@playwright/test'
import { seedRecipe, type SeedRecipe } from './fixtures.ts'
import { expect } from './test.ts'

// Paging recipes for the /recipes grid: quick recipes tagged "paging", all
// published at the same instant (before every seed recipe), so pages split
// inside a tie on publishedAt and the order within it comes from _id alone.
// Newest first they come by _id descending, after the seeds.

// The seed recipes, newest first. The paging recipes come after them.
export const newestFirst = ['E2E Pork Chops', 'E2E Chicken Curry', 'E2E Beef Burgers', 'E2E Chicken Tacos', 'E2E Beef Stew']

export const pagingName = (n: number) => `E2E Paging ${String(n).padStart(2, '0')}`

export const range = (from: number, to: number) => {
  const step = from <= to ? 1 : -1
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + i * step)
}

export function pagingRecipes(count: number): SeedRecipe[] {
  const template = seedRecipe('E2E Chicken Tacos')
  return range(1, count).map((n) => ({
    ...template,
    _id: `65b${n.toString(16).padStart(21, '0')}`,
    name: pagingName(n),
    slug: `e2e-paging-${n}`,
    imagePublicId: `recipes/e2e-paging-${n}`,
    tags: ['paging'],
    prepTime: 10,
    cookTime: 10,
    publishedAt: new Date('2023-06-01T12:00:00Z'),
    createdAt: new Date('2023-06-01T12:00:00Z'),
  }))
}

// The grid loads the next page when a sentinel near its end scrolls into
// view. Tests of the "More recipes" button turn that off, so a click is the
// only thing that loads: as for a keyboard user who never scrolls there.
export async function disableAutoLoad(page: Page) {
  await page.addInitScript(() => {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver
  })
}

export const recipeGridNames = (page: Page) =>
  page
    .getByRole('region', { name: 'Recipes', exact: true })
    .getByRole('heading', { level: 3 })
export const moreRecipesButton = (page: Page) => page.getByRole('button', { name: 'More recipes', exact: true })
export const moreRecipes = (page: Page) =>
  moreRecipesButton(page).or(page.getByRole('link', { name: 'More recipes', exact: true }))
export const endOfList = (page: Page) => page.getByText("That's every recipe.", { exact: true })

// Resolves once two frames have rendered, after which intersection observers have had their say.
export const renderedFrames = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve)))))

// Every /api/recipes request the page makes, in order.
export function apiRequests(page: Page): URL[] {
  const urls: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/recipes') urls.push(url)
  })
  return urls
}

// The hydrated grid: "More recipes" is a button once the client takes over.
export async function openListing(page: Page, path: string) {
  await page.goto(path)
  await expect(moreRecipesButton(page)).toBeVisible()
}
