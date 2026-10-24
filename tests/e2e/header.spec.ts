import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { seedRecipe, type SeedRecipe } from './fixtures.ts'

// Every page renders the same site header. Each test below runs once per
// page; /new and the edit page are admin-only, so they run signed in as admin.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

type Session = 'signed out' | 'user' | 'admin'

const stew = seedRecipe('E2E Beef Stew')

const sitePages: { path: string; sessions: Session[] }[] = [
  { path: '/', sessions: ['signed out', 'user', 'admin'] },
  { path: '/recipes', sessions: ['signed out', 'user', 'admin'] },
  { path: `/recipes/${stew.slug}`, sessions: ['signed out', 'user', 'admin'] },
  { path: '/new', sessions: ['admin'] },
  { path: `/recipes/${stew.slug}/edit`, sessions: ['admin'] },
]

const emailFor = (session: Exclude<Session, 'signed out'>) =>
  `${session}@example.com`

const startAs = async (context: BrowserContext, session: Session) => {
  if (session === 'signed out') return
  await signInAs(context, { email: emailFor(session), role: session })
}

// Desktop and mobile menus may both render a control; only one is visible.
const visibleButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true })

// On desktop only the header's inline search renders; the mobile menu's copy
// lives in a closed dialog.
const search = (page: Page) =>
  page.getByRole('combobox', { name: 'Search Recipes' })

const expectRecipePage = async (page: Page, target: SeedRecipe) => {
  await expect(page).toHaveURL(`/recipes/${target.slug}`)
  await expect(
    page.getByRole('heading', { level: 1, name: target.name })
  ).toBeVisible()
}

for (const { path, sessions } of sitePages) {
  // The least privileged session the page allows.
  const session = sessions[0]

  test.describe(`header on ${path}`, () => {
    test('is a single banner landmark containing the site nav', async ({
      context,
      page,
    }) => {
      await startAs(context, session)
      await page.goto(path)

      const banner = page.getByRole('banner')
      await expect(banner).toHaveCount(1)
      const nav = banner.getByRole('navigation')
      await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'Recipes', exact: true })).toBeVisible()
    })

    for (const as of sessions) {
      if (as === 'signed out') {
        test('signed out, shows Sign in and no Add Recipe link', async ({ page }) => {
          await page.goto(path)

          await expect(visibleButton(page, 'Sign in')).toBeVisible()
          await expect(visibleButton(page, 'Sign out')).toHaveCount(0)
          await expect(page.getByRole('link', { name: 'Add Recipe' })).toHaveCount(0)
        })
        continue
      }

      test(`signed in as ${as}, shows the email and Sign out, and Add Recipe only for admins`, async ({
        context,
        page,
      }) => {
        await startAs(context, as)
        await page.goto(path)

        await expect(visibleButton(page, 'Sign out')).toBeVisible()
        await expect(
          page.getByText(emailFor(as), { exact: true }).filter({ visible: true })
        ).toBeVisible()
        await expect(visibleButton(page, 'Sign in')).toHaveCount(0)
        if (as === 'admin') {
          await expect(
            page.getByRole('navigation').getByRole('link', { name: 'Add Recipe' })
          ).toBeVisible()
        } else {
          await expect(page.getByRole('link', { name: 'Add Recipe' })).toHaveCount(0)
        }
      })
    }

    test('choosing a search option with the keyboard opens that recipe', async ({
      context,
      page,
    }) => {
      const curry = seedRecipe('E2E Chicken Curry')
      await startAs(context, session)
      await page.goto(path)

      await search(page).fill('curry')
      await expect(page.getByRole('option', { name: curry.name })).toBeVisible()
      await search(page).press('ArrowDown')
      await search(page).press('Enter')

      await expectRecipePage(page, curry)
    })

    test('clicking a search option opens that recipe', async ({ context, page }) => {
      const tacos = seedRecipe('E2E Chicken Tacos')
      await startAs(context, session)
      await page.goto(path)

      await search(page).fill('tacos')
      await page.getByRole('option', { name: tacos.name }).click()

      await expectRecipePage(page, tacos)
    })

    test.describe('mobile menu', () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: false })

      // Follow a menu link that leads somewhere else.
      const { link, target, h1 } =
        path === '/recipes'
          ? { link: 'Home', target: '/', h1: "Llama's Kitchen" }
          : { link: 'Recipes', target: '/recipes', h1: 'Recipes' }

      const openMenu = async (page: Page) => {
        await page.getByRole('button', { name: 'Open main menu' }).click()
        // The dialog element has no box of its own (its panel is position:
        // fixed), so wait for the panel's Close menu button instead.
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeVisible()
        return dialog
      }

      test.beforeEach(async ({ context, page }) => {
        await startAs(context, session)
        await page.goto(path)
      })

      test('"Open main menu" opens a dialog with the nav links, auth control and focus on Close menu', async ({
        page,
      }) => {
        const dialog = await openMenu(page)

        await expect(dialog.getByRole('link', { name: 'Home', exact: true })).toBeVisible()
        await expect(dialog.getByRole('link', { name: 'Recipes', exact: true })).toBeVisible()
        await expect(
          dialog.getByRole('button', {
            name: session === 'signed out' ? 'Sign in' : 'Sign out',
            exact: true,
          })
        ).toBeVisible()
        await expect(dialog.getByRole('link', { name: 'Add Recipe' })).toHaveCount(
          session === 'admin' ? 1 : 0
        )
        await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeFocused()
      })

      test('"Close menu" closes the menu', async ({ page }) => {
        const dialog = await openMenu(page)

        await dialog.getByRole('button', { name: 'Close menu' }).click()

        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      test('Escape closes the menu', async ({ page }) => {
        await openMenu(page)

        await page.keyboard.press('Escape')

        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      test(`clicking "${link}" in the menu navigates to ${target}`, async ({ page }) => {
        const dialog = await openMenu(page)

        await dialog.getByRole('link', { name: link, exact: true }).click()

        await expect(page).toHaveURL(target)
        await expect(
          page.getByRole('heading', { level: 1, name: h1, exact: true })
        ).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      })
    })
  })
}

// The nav marks the current page's link; a recipe page counts as Recipes,
// its edit page as neither.
const globalNavLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name, exact: true })

for (const { path, current, other } of [
  { path: '/', current: 'Home', other: 'Recipes' },
  { path: '/recipes', current: 'Recipes', other: 'Home' },
  { path: `/recipes/${stew.slug}`, current: 'Recipes', other: 'Home' },
]) {
  test(`on ${path} the ${current} link is the current page and ${other} is not`, async ({ page }) => {
    await page.goto(path)

    await expect(globalNavLink(page, current)).toHaveAttribute('aria-current', 'page')
    await expect(globalNavLink(page, other)).not.toHaveAttribute('aria-current')
  })
}

test('on an edit page neither Home nor Recipes is the current page', async ({ context, page }) => {
  await startAs(context, 'admin')
  await page.goto(`/recipes/${stew.slug}/edit`)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(globalNavLink(page, 'Home')).not.toHaveAttribute('aria-current')
  await expect(globalNavLink(page, 'Recipes')).not.toHaveAttribute('aria-current')
})

// The pending "E2E Pending Beef Pie" matches too, but is never an option.
test('typing part of a recipe name shows matching search options and hides the rest', async ({
  page,
}) => {
  await page.goto('/recipes')

  await search(page).fill('beef')

  await expect(page.getByRole('option')).toHaveCount(2)
  await expect(page.getByRole('option', { name: 'E2E Beef Stew' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'E2E Beef Burgers' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'E2E Chicken Tacos' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'E2E Pork Chops' })).toHaveCount(0)
})
