import type { Page } from '@playwright/test'

// The public recipe page (app/recipes/[slug]/page.tsx). Each list is named by
// its heading (aria-labelledby) or aria-label.

export const ingredientItems = (page: Page) =>
  page.getByRole('list', { name: 'Ingredients', exact: true }).getByRole('listitem')

export const stepsList = (page: Page) => page.getByRole('list', { name: 'Steps', exact: true })

// Each step's text. The number badge beside it is decorative, so it's left out.
export const stepTexts = (page: Page) => stepsList(page).getByRole('listitem').getByRole('paragraph')

export const tagLinks = (page: Page) => page.getByRole('list', { name: 'Tags', exact: true }).getByRole('link')

// Each tag's visible text, without the link's sr-only "Recipes tagged " prefix.
export const tagItems = (page: Page) => tagLinks(page).locator('span:not(.sr-only)')

// The facts row is the page's only <dl>: Prep, Cook, Total and Serves.
export const factTerms = (page: Page) => page.getByRole('term')

export const factValues = (page: Page) => page.getByRole('definition')
