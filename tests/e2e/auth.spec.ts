import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { seedRecipes } from './fixtures.ts'

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

// Home uses components/Landing.js, /recipes uses components/Nav.js and a
// recipe page uses components/NavNoSearch.js.
const pagesWithNav = [
  { nav: 'Landing', path: '/' },
  { nav: 'Nav', path: '/recipes' },
  { nav: 'NavNoSearch', path: `/${seedRecipes[0]._id}` },
]

// Desktop and mobile menus may both render the control; only one is visible.
const visibleButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true })

for (const { nav, path } of pagesWithNav) {
  test(`signed out, ${nav} shows a Sign in button`, async ({ page }) => {
    await page.goto(path)

    await expect(visibleButton(page, 'Sign in')).toBeVisible()
    await expect(visibleButton(page, 'Sign out')).toHaveCount(0)
  })
}

for (const role of ['admin', 'user'] as const) {
  const email = `${role}@example.com`

  for (const { nav, path } of pagesWithNav) {
    test(`signed in as ${role}, ${nav} shows the email and a Sign out button`, async ({
      context,
      page,
    }) => {
      await signInAs(context, { email, role })
      await page.goto(path)

      await expect(visibleButton(page, 'Sign out')).toBeVisible()
      await expect(
        page.getByText(email, { exact: true }).filter({ visible: true })
      ).toBeVisible()
      await expect(visibleButton(page, 'Sign in')).toHaveCount(0)
    })
  }

  test(`signed in as ${role}, the session API returns the role`, async ({
    context,
    page,
  }) => {
    await signInAs(context, { email, role })

    const response = await page.request.get('/api/auth/session')

    expect(response.ok()).toBe(true)
    const session = await response.json()
    expect(session.user.email).toBe(email)
    expect(session.user.role).toBe(role)
  })
}
