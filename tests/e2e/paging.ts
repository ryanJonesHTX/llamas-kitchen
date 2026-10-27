import type { Page } from '@playwright/test'
import { seedRecipe, type SeedRecipe } from './fixtures.ts'

// Paging recipes for the /recipes grid: quick recipes tagged "paging", all
// published at the same instant (before every seed recipe), so pages split
// inside a tie on publishedAt and the order within it comes from _id alone.
// Newest first they come by _id descending, after the seeds.

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
