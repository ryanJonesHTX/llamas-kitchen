import { expect, test } from './test.ts'

test('an unmatched URL responds 404 with the not-found page', async ({
  page,
}) => {
  const response = await page.goto('/a/b/c')

  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'Page not found' })
  ).toBeVisible()
  await page.getByRole('link', { name: 'Go back home' }).click()
  await expect(page).toHaveURL('/')
})

test('responses do not send X-Powered-By', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.headers()['x-powered-by']).toBeUndefined()
})
