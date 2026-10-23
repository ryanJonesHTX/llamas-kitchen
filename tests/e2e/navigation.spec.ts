import { expect, test, type Page } from '@playwright/test'
import { disconnect, reseed } from './db.ts'
import { seedRecipes } from './fixtures.ts'

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const recipe = (name: string) => {
  const found = seedRecipes.find((r) => r.name === name)
  if (!found) throw new Error(`No seed recipe named ${name}`)
  return found
}

test.describe('search combobox (desktop, Nav on /recipes)', () => {
  // On desktop only the Nav's inline search renders; the mobile menu's copy
  // lives in a closed dialog.
  const search = (page: Page) =>
    page.getByRole('combobox', { name: 'Search Recipes' })

  test('typing part of a recipe name shows matching options and hides the rest', async ({
    page,
  }) => {
    await page.goto('/recipes')

    await search(page).fill('beef')

    await expect(page.getByRole('option')).toHaveCount(2)
    await expect(
      page.getByRole('option', { name: 'E2E Beef Stew' })
    ).toBeVisible()
    await expect(
      page.getByRole('option', { name: 'E2E Beef Burgers' })
    ).toBeVisible()
    await expect(
      page.getByRole('option', { name: 'E2E Chicken Tacos' })
    ).toHaveCount(0)
    await expect(
      page.getByRole('option', { name: 'E2E Pork Chops' })
    ).toHaveCount(0)
  })

  test('clicking an option opens that recipe', async ({ page }) => {
    const tacos = recipe('E2E Chicken Tacos')
    await page.goto('/recipes')

    await search(page).fill('tacos')
    await page.getByRole('option', { name: tacos.name }).click()

    await expect(page).toHaveURL(`/${tacos._id}`)
    await expect(
      page.getByRole('heading', { level: 1, name: tacos.name })
    ).toBeVisible()
  })

  test('choosing an option with the keyboard opens that recipe', async ({
    page,
  }) => {
    const curry = recipe('E2E Chicken Curry')
    await page.goto('/recipes')

    await search(page).fill('curry')
    await expect(page.getByRole('option', { name: curry.name })).toBeVisible()
    await search(page).press('ArrowDown')
    await search(page).press('Enter')

    await expect(page).toHaveURL(`/${curry._id}`)
    await expect(
      page.getByRole('heading', { level: 1, name: curry.name })
    ).toBeVisible()
  })
})

test.describe('mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: false })

  // Home uses components/Landing.js, /recipes uses components/Nav.js and a
  // recipe page uses components/NavNoSearch.js. Each page follows a menu link
  // that leads somewhere else.
  const pagesWithMobileMenu = [
    { nav: 'Landing', path: '/', link: 'Recipes', target: '/recipes', h1: 'Recipes' },
    { nav: 'Nav', path: '/recipes', link: 'Home', target: '/', h1: "Llama's Kitchen" },
    { nav: 'NavNoSearch', path: `/${seedRecipes[0]._id}`, link: 'Recipes', target: '/recipes', h1: 'Recipes' },
  ]

  const openMenu = async (page: Page) => {
    await page.getByRole('button', { name: 'Open main menu' }).click()
    // The dialog element has no box of its own (its panel is position:
    // fixed), so wait for the panel's Close menu button instead.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeVisible()
    return dialog
  }

  for (const { nav, path, link, target, h1 } of pagesWithMobileMenu) {
    test.describe(nav, () => {
      test('"Open main menu" opens a dialog with the nav links and Sign in', async ({
        page,
      }) => {
        await page.goto(path)

        const dialog = await openMenu(page)

        await expect(
          dialog.getByRole('link', { name: 'Home', exact: true })
        ).toBeVisible()
        await expect(
          dialog.getByRole('link', { name: 'Recipes', exact: true })
        ).toBeVisible()
        await expect(
          dialog.getByRole('button', { name: 'Sign in', exact: true })
        ).toBeVisible()
      })

      test('the Close menu button has focus after opening', async ({ page }) => {
        await page.goto(path)

        const dialog = await openMenu(page)

        await expect(
          dialog.getByRole('button', { name: 'Close menu' })
        ).toBeFocused()
      })

      test('"Close menu" closes the menu', async ({ page }) => {
        await page.goto(path)
        const dialog = await openMenu(page)

        await dialog.getByRole('button', { name: 'Close menu' }).click()

        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      test('Escape closes the menu', async ({ page }) => {
        await page.goto(path)
        await openMenu(page)

        await page.keyboard.press('Escape')

        await expect(page.getByRole('dialog')).toHaveCount(0)
      })

      test('clicking a nav link in the menu navigates', async ({ page }) => {
        await page.goto(path)
        const dialog = await openMenu(page)

        await dialog.getByRole('link', { name: link, exact: true }).click()

        await expect(page).toHaveURL(target)
        await expect(
          page.getByRole('heading', { level: 1, name: h1, exact: true })
        ).toBeVisible()
      })
    })
  }
})
