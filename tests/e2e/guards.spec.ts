import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { captureNextAction, replayAction, type CapturedAction } from './actions.ts'
import { signInAs } from './auth.ts'
import { countRecipes, disconnect, findRecipe, reseed } from './db.ts'
import { seedRecipe, seedRecipes } from './fixtures.ts'
import { fillNewRecipe, formField, imageInput, newRecipe, saveButton } from './recipeForm.ts'
import { blockBrowserCloudinary, cloudinaryUploads, VALID_PNG } from './uploads.ts'

// Creating needs a signed-in user and editing an admin, in the pages and in
// the server actions behind them; reading stays public.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')
const editPage = `/recipes/${stew.slug}/edit`
const guardedPages = ['/new', editPage]

// Signed-in users get two ways to /new: the header and mobile menu nav links,
// named "Add Recipe", and the home page hero's call-to-action, named "Add a recipe".
const addRecipeLinks = (page: Page) => page.getByRole('link', { name: 'Add Recipe' })
const heroAddLink = (page: Page) => page.getByRole('link', { name: 'Add a recipe', exact: true })

test.describe('signed out', () => {
  test('home page shows no Add a recipe call-to-action', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: "Llama's Kitchen" })).toBeVisible()
    await expect(heroAddLink(page)).toHaveCount(0)
  })

  for (const path of guardedPages) {
    test(`visiting ${path} lands on the sign-in page`, async ({ page }) => {
      await page.goto(path)

      const url = new URL(page.url())
      expect(url.pathname).toMatch(/^\/api\/auth\/signin/)
      expect(url.searchParams.get('callbackUrl')).toBe(path)
    })
  }
})

test.describe('signed in as user', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { email: 'user@example.com', role: 'user' })
  })

  test('home page shows the Add a recipe call-to-action', async ({ page }) => {
    await page.goto('/')

    await expect(heroAddLink(page)).toHaveAttribute('href', '/new')
  })

  test('visiting /new shows the form', async ({ page }) => {
    const response = await page.goto('/new')

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'New Recipe' })).toBeVisible()
  })

  test(`visiting ${editPage} responds 404`, async ({ page }) => {
    const response = await page.goto(editPage)

    expect(response?.status()).toBe(404)
  })
})

test('signed in as admin, home page shows the Add Recipe call-to-action', async ({ context, page }) => {
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  await page.goto('/')

  // The desktop nav link, and the hero's call-to-action next to "Browse recipes".
  await expect(addRecipeLinks(page).filter({ visible: true })).toHaveCount(1)
  await expect(heroAddLink(page)).toHaveAttribute('href', '/new')
})

// Server actions are public POST endpoints. Each test captures an action POST
// an admin's browser sends (aborted, so it never runs), replays it without the
// rights it needs and checks nothing changed, then replays it as the admin to
// prove the captured request does work.
test.describe('replaying an admin server action', () => {
  let userContext: BrowserContext

  test.beforeEach(async ({ browser, context }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
    userContext = await signedInUserContext(browser)
  })

  test.afterEach(async () => {
    await userContext.close()
  })

  // The action's guard throws, so the replay fails.
  async function replayAnonymous(request: APIRequestContext, action: CapturedAction) {
    expect((await replayAction(request, action)).ok(), 'no session').toBe(false)
  }

  async function replayAsUser(action: CapturedAction) {
    return (await replayAction(userContext.request, action)).ok()
  }

  async function replayAsAdmin(page: Page, action: CapturedAction) {
    expect((await replayAction(page.request, action)).ok()).toBe(true)
  }

  test('create, without a session, saves nothing; as a user, saves it pending', async ({ page, request }) => {
    await page.goto('/new')
    await fillNewRecipe(page)
    const create = await captureNextAction(page, () => saveButton(page).click())
    expect(await countRecipes()).toBe(seedRecipes.length)

    await replayAnonymous(request, create)
    expect(await countRecipes()).toBe(seedRecipes.length)

    // The status comes from the session, not the request.
    expect(await replayAsUser(create)).toBe(true)
    expect(await findRecipe({ slug: newRecipe.slug })).toMatchObject({ status: 'pending' })

    await replayAsAdmin(page, create)
    expect(await findRecipe({ slug: `${newRecipe.slug}-2` })).toMatchObject({ status: 'published' })
    expect(await countRecipes()).toBe(seedRecipes.length + 2)
  })

  test('update, without a session or as a user, changes nothing', async ({ page, request }) => {
    const description = 'Replayed description.'
    await page.goto(`/recipes/${stew.slug}/edit`)
    await formField(page, 'Description').fill(description)
    const update = await captureNextAction(page, () => saveButton(page).click())

    await replayAnonymous(request, update)
    expect(await replayAsUser(update), 'user session').toBe(false)
    expect((await findRecipe({ _id: stew._id }))?.description).toBe(stew.description)

    await replayAsAdmin(page, update)
    expect((await findRecipe({ _id: stew._id }))?.description).toBe(description)
  })

  test('upload, without a session, sends nothing to Cloudinary', async ({ page, request }) => {
    await blockBrowserCloudinary(page)
    await page.goto('/new')
    const upload = await captureNextAction(page, () =>
      imageInput(page).setInputFiles({ name: 'replayed.png', mimeType: 'image/png', buffer: VALID_PNG })
    )

    await replayAnonymous(request, upload)
    expect(cloudinaryUploads()).toEqual([])

    await replayAsAdmin(page, upload)
    expect(cloudinaryUploads().map((u) => u.file.name)).toEqual(['replayed.png'])
  })
})

async function signedInUserContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext()
  await signInAs(context, { email: 'user@example.com', role: 'user' })
  return context
}
