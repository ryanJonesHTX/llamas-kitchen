import type { Page } from '@playwright/test'

// The public recipe page (app/recipes/[slug]/page.tsx). Each list is named by
// its heading (aria-labelledby) or aria-label.

export const ingredientItems = (page: Page) =>
  page.getByRole('list', { name: 'Ingredients', exact: true }).getByRole('listitem')

export const stepsList = (page: Page) => page.getByRole('list', { name: 'Steps', exact: true })

export const tagItems = (page: Page) => page.getByRole('list', { name: 'Tags', exact: true }).getByRole('listitem')
