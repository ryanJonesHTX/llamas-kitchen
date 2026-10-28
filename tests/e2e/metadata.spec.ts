import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { E2E_AUTH_URL, hiddenRecipes, SEED_SUBMITTER_ID, seedRecipe, type SeedRecipe } from './fixtures.ts'

// Page titles and link-preview tags (Open Graph and Twitter cards).

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const SITE_NAME = "Llama's Kitchen"
const ORIGIN = new URL(E2E_AUTH_URL).origin
const SITE_PREVIEW_IMAGE = `${ORIGIN}/preview-image`
const ogPhoto = (publicId: string) =>
  `https://res.cloudinary.com/e2e-cloud/image/upload/c_fill,w_1200,h_630,f_auto,q_auto/${publicId}`

const og = (page: Page, property: string) => page.locator(`meta[property="og:${property}"]`)
const twitter = (page: Page, name: string) => page.locator(`meta[name="twitter:${name}"]`)
const description = (page: Page) => page.locator('meta[name="description"]')
const robots = (page: Page) => page.locator('meta[name="robots"]')
const contents = (meta: ReturnType<Page['locator']>) =>
  meta.evaluateAll((tags) => tags.map((tag) => tag.getAttribute('content')))

const admin = { email: 'e2e-admin@example.com', role: 'admin' as const }
const submitter = { id: SEED_SUBMITTER_ID, email: 'e2e-submitter@example.com', role: 'user' as const }

test.describe('page titles', () => {
  test('the home page is titled with the site name alone', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(SITE_NAME)
  })

  test('the recipe list is titled "Recipes"', async ({ page }) => {
    await page.goto('/recipes')
    await expect(page).toHaveTitle(`Recipes | ${SITE_NAME}`)
  })

  test('the add recipe page is titled "Add recipe"', async ({ context, page }) => {
    await signInAs(context, { email: 'e2e-user@example.com', role: 'user' })
    await page.goto('/new')
    await expect(page).toHaveTitle(`Add recipe | ${SITE_NAME}`)
  })

  test('my recipes is titled "My recipes"', async ({ context, page }) => {
    await signInAs(context, { email: 'e2e-user@example.com', role: 'user' })
    await page.goto('/my-recipes')
    await expect(page).toHaveTitle(`My recipes | ${SITE_NAME}`)
  })

  test('the review queue is titled "Review queue"', async ({ context, page }) => {
    await signInAs(context, admin)
    await page.goto('/admin/queue')
    await expect(page).toHaveTitle(`Review queue | ${SITE_NAME}`)
  })

  test('a missing page is titled "Page not found"', async ({ page }) => {
    const response = await page.goto('/a/b/c')
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(`Page not found | ${SITE_NAME}`)
  })

  test("a published recipe is titled with the recipe's name", async ({ page }) => {
    const stew = seedRecipe('E2E Beef Stew')
    await page.goto(`/recipes/${stew.slug}`)
    await expect(page).toHaveTitle(`${stew.name} | ${SITE_NAME}`)
  })

  test("a recipe's edit page is titled \"Edit\" and the recipe's name", async ({ context, page }) => {
    const stew = seedRecipe('E2E Beef Stew')
    await signInAs(context, admin)
    await page.goto(`/recipes/${stew.slug}/edit`)
    await expect(page).toHaveTitle(`Edit ${stew.name} | ${SITE_NAME}`)
  })
})

test('every page carries the site-wide preview tags, with the site preview image', async ({ page }) => {
  await page.goto('/recipes')

  await expect(og(page, 'site_name')).toHaveAttribute('content', SITE_NAME)
  await expect(description(page)).toHaveAttribute('content', /\S/)
  await expect(twitter(page, 'card')).toHaveAttribute('content', 'summary_large_image')
  await expect(og(page, 'image')).toHaveCount(1)
  await expect(og(page, 'image')).toHaveAttribute('content', SITE_PREVIEW_IMAGE)
  await expect(og(page, 'image:width')).toHaveAttribute('content', '1200')
  await expect(og(page, 'image:height')).toHaveAttribute('content', '630')
})

test.describe('a published recipe', () => {
  const stew = seedRecipe('E2E Beef Stew')

  // A copy of a seed recipe with no photo.
  const noPhoto: SeedRecipe = {
    ...seedRecipe('E2E Chicken Tacos'),
    imagePublicId: undefined,
    _id: '65e000000000000000000001',
    name: 'E2E Photoless Tacos',
    slug: 'e2e-photoless-tacos',
    description: 'Tacos with no picture.',
  }

  test('previews as an article with its name, description and canonical URL', async ({ page }) => {
    await page.goto(`/recipes/${stew.slug}`)

    await expect(og(page, 'title')).toHaveAttribute('content', stew.name)
    await expect(og(page, 'description')).toHaveAttribute('content', stew.description)
    await expect(og(page, 'type')).toHaveAttribute('content', 'article')
    await expect(og(page, 'url')).toHaveAttribute('content', `${ORIGIN}/recipes/${stew.slug}`)
    await expect(og(page, 'site_name')).toHaveAttribute('content', SITE_NAME)
  })

  test('with a photo, previews with the photo cropped to 1200x630 in place of the site image', async ({ page }) => {
    await page.goto(`/recipes/${stew.slug}`)

    const photo = ogPhoto(stew.imagePublicId!)
    await expect(og(page, 'image')).toHaveCount(1)
    await expect(og(page, 'image')).toHaveAttribute('content', photo)
    await expect(og(page, 'image:width')).toHaveAttribute('content', '1200')
    await expect(og(page, 'image:height')).toHaveAttribute('content', '630')
    await expect(og(page, 'image:alt')).toHaveAttribute('content', stew.name)
    await expect(twitter(page, 'image')).toHaveAttribute('content', photo)
  })

  test('without a photo, previews with its own generated preview image', async ({ page }) => {
    await insertRecipes([noPhoto])

    await page.goto(`/recipes/${noPhoto.slug}`)

    const generated = `${ORIGIN}/recipes/${noPhoto.slug}/preview-image`
    await expect(page.getByRole('heading', { level: 1, name: noPhoto.name })).toBeVisible()
    await expect(og(page, 'image')).toHaveCount(1)
    await expect(og(page, 'image')).toHaveAttribute('content', generated)
    await expect(og(page, 'image:alt')).toHaveAttribute('content', noPhoto.name)
    await expect(twitter(page, 'image')).toHaveAttribute('content', generated)
  })

  test('has no robots meta', async ({ page }) => {
    await page.goto(`/recipes/${stew.slug}`)

    await expect(og(page, 'title')).toHaveAttribute('content', stew.name)
    await expect(robots(page)).toHaveCount(0)
  })
})

for (const hidden of hiddenRecipes) {
  for (const viewer of [
    { who: 'its submitter', user: submitter },
    { who: 'an admin', user: admin },
  ]) {
    test(`a ${hidden.status} recipe, seen by ${viewer.who}, is titled with its name, not indexed, and has no recipe preview`, async ({
      context,
      page,
    }) => {
      await signInAs(context, viewer.user)

      const response = await page.goto(`/recipes/${hidden.slug}`)

      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(`${hidden.name} | ${SITE_NAME}`)
      await expect(robots(page)).toHaveAttribute('content', /noindex/)

      // Next fills og:title and twitter:title from the page title when the
      // page sets no openGraph; only a permitted viewer gets this far.
      const title = `${hidden.name} | ${SITE_NAME}`
      expect(await contents(og(page, 'title'))).toEqual([title])
      expect(await contents(twitter(page, 'title'))).toEqual([title])
      expect(await contents(og(page, 'type'))).not.toContain('article')
      expect(await contents(og(page, 'url'))).toEqual([])

      // Only the site preview image: no photo, no generated recipe image.
      expect(await contents(og(page, 'image'))).toEqual([SITE_PREVIEW_IMAGE])
      expect(await contents(twitter(page, 'image'))).toEqual([SITE_PREVIEW_IMAGE])

      expect((await contents(og(page, 'description'))).join(' ')).not.toContain(hidden.description)
    })
  }
}
