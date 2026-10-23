import { expect, test } from '@playwright/test'
import { seedRecipes } from './fixtures.ts'

// Bots probe paths like /index.php, which land on pages/[id]/index.js.
test('a recipe URL that is not a valid id responds 404', async ({ page }) => {
  const response = await page.goto('/index.php')

  expect(response?.status()).toBe(404)
})

test('a valid id with no matching recipe responds 404', async ({ page }) => {
  const missingId = '65a0000000000000000000ff'
  expect(seedRecipes.map((r) => r._id)).not.toContain(missingId)

  const response = await page.goto(`/${missingId}`)

  expect(response?.status()).toBe(404)
})
