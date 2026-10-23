import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { seedRecipes } from './fixtures.ts'

// Phase 1: create, edit and delete are admin-only; reading stays public.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipes[0]
const guardedPages = ['/new', `/${stew._id}/edit`]

const newRecipe = {
  name: 'E2E Guarded Lasagna',
  description: 'Should never be saved.',
  directions: 'Layer and bake.',
  ingredients: [{ id: 0, ingredient: 'Lasagna sheets' }],
  prepTime: 30,
  cookTime: 45,
  photo: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  cloudinaryId: 'e2e-guarded-lasagna',
  category: 'Pasta',
}

const visibleButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true })

// The nav links and the Landing call-to-action ("Add Recipe →", whose arrow
// is aria-hidden) all have the accessible name "Add Recipe".
const addRecipeLinks = (page: Page) =>
  page.getByRole('link', { name: 'Add Recipe' })

test.describe('signed out', () => {
  for (const path of guardedPages) {
    test(`visiting ${path} lands on the sign-in page`, async ({ page }) => {
      await page.goto(path)

      const url = new URL(page.url())
      expect(url.pathname).toMatch(/^\/api\/auth\/signin/)
      expect(url.searchParams.get('callbackUrl')).toBe(path)
    })
  }

  test('POST /api/recipes returns 401 and saves nothing', async ({ page }) => {
    const response = await page.request.post('/api/recipes', { data: newRecipe })

    expect(response.status()).toBe(401)
    const all = await (await page.request.get('/api/recipes')).json()
    expect(all.data).toHaveLength(seedRecipes.length)
  })

  test('DELETE /api/recipes/<id> returns 401 and the recipe still exists', async ({
    page,
  }) => {
    const response = await page.request.delete(`/api/recipes/${stew._id}`)

    expect(response.status()).toBe(401)
    expect((await page.request.get(`/api/recipes/${stew._id}`)).status()).toBe(200)
  })
})

test.describe('signed in as user', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { email: 'user@example.com', role: 'user' })
  })

  for (const path of guardedPages) {
    test(`visiting ${path} responds 404`, async ({ page }) => {
      const response = await page.goto(path)

      expect(response?.status()).toBe(404)
    })
  }

  test('POST /api/recipes returns 403 and saves nothing', async ({ page }) => {
    const response = await page.request.post('/api/recipes', { data: newRecipe })

    expect(response.status()).toBe(403)
    const all = await (await page.request.get('/api/recipes')).json()
    expect(all.data).toHaveLength(seedRecipes.length)
  })

  test('DELETE /api/recipes/<id> returns 403 and the recipe still exists', async ({
    page,
  }) => {
    const response = await page.request.delete(`/api/recipes/${stew._id}`)

    expect(response.status()).toBe(403)
    expect((await page.request.get(`/api/recipes/${stew._id}`)).status()).toBe(200)
  })
})

// Home uses components/Landing.js, /recipes uses components/Nav.js and a
// recipe page uses components/NavNoSearch.js.
const pagesWithNav = [
  { nav: 'Landing', path: '/' },
  { nav: 'Nav', path: '/recipes' },
  { nav: 'NavNoSearch', path: `/${stew._id}` },
]

for (const { nav, path } of pagesWithNav) {
  test(`signed out, ${nav} hides the Add Recipe link`, async ({ page }) => {
    await page.goto(path)
    // Wait for the session to load so the links have their final state.
    await expect(visibleButton(page, 'Sign in')).toBeVisible()

    await expect(addRecipeLinks(page)).toHaveCount(0)
  })

  test(`signed in as user, ${nav} hides the Add Recipe link`, async ({
    context,
    page,
  }) => {
    await signInAs(context, { email: 'user@example.com', role: 'user' })
    await page.goto(path)
    await expect(visibleButton(page, 'Sign out')).toBeVisible()

    await expect(addRecipeLinks(page)).toHaveCount(0)
  })

  test(`signed in as admin, ${nav} shows the Add Recipe link`, async ({
    context,
    page,
  }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
    await page.goto(path)

    await expect(
      addRecipeLinks(page).filter({ visible: true }).first()
    ).toBeVisible()
  })
}

test('signed in as admin, Landing shows the Add Recipe call-to-action', async ({
  context,
  page,
}) => {
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  await page.goto('/')

  // One in the desktop nav, one next to "All Recipes".
  await expect(addRecipeLinks(page).filter({ visible: true })).toHaveCount(2)
})

test('admin edits a recipe description and keeps its ingredients', async ({
  context,
  page,
}) => {
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  const newDescription = 'Slow cooked beef stew, now with more pepper.'

  await page.goto(`/${stew._id}/edit`)
  const description = page.getByLabel('Description')
  await expect(description).toHaveValue(stew.description)
  await description.fill(newDescription)
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.waitForURL('/')

  // The recipe page does not render the description, so read it back
  // through the public API.
  const saved = await (await page.request.get(`/api/recipes/${stew._id}`)).json()
  expect(saved.data.description).toBe(newDescription)

  await page.goto(`/${stew._id}`)
  await expect(page.getByRole('listitem')).toHaveText(
    stew.ingredients.map((i) => i.ingredient)
  )
})
