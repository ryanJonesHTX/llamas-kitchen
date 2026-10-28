import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { listingHref } from '../../lib/recipes/listingHref.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { hiddenRecipes, pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, seedRecipe, seedRecipes } from './fixtures.ts'
import { signInAs } from './auth.ts'
import { factTerms, factValues, ingredientItems, stepsList, stepTexts, tagItems, tagLinks } from './recipePage.ts'

// The recipe page, /recipes/<slug>: published recipes for everyone; pending
// and rejected ones only for their submitter and admins.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

test('a published recipe shows its name, description, ingredients, steps as an ordered list, tags, servings and credit', async ({
  page,
}) => {
  const stew = seedRecipe('E2E Beef Stew')

  const response = await page.goto(`/recipes/${stew.slug}`)

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: stew.name })).toBeVisible()
  await expect(page.getByText(stew.description)).toBeVisible()
  await expect(ingredientItems(page)).toHaveText(['2 lb stewing beef', '3 carrots', '4 cups beef stock'])
  await expect(stepsList(page)).toHaveJSProperty('tagName', 'OL')
  await expect(stepsList(page).getByRole('listitem')).toHaveCount(stew.steps.length)
  await expect(stepTexts(page)).toHaveText(stew.steps)
  await expect(tagItems(page)).toHaveText(stew.tags)
  await expect(factTerms(page).last()).toHaveText('Serves')
  await expect(factValues(page).last()).toHaveText(String(stew.servings))
  await expect(page.getByText(stew.credit!)).toBeVisible()
})

test('a recipe with a sourceUrl links to it as "Source"', async ({ page }) => {
  const stew = seedRecipe('E2E Beef Stew')

  await page.goto(`/recipes/${stew.slug}`)

  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', stew.sourceUrl!)
})

test('a recipe without a sourceUrl has no Source link', async ({ page }) => {
  const tacos = seedRecipe('E2E Chicken Tacos')
  expect(tacos.sourceUrl).toBeUndefined()

  await page.goto(`/recipes/${tacos.slug}`)

  await expect(page.getByRole('heading', { level: 1, name: tacos.name })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveCount(0)
})

const robots = (page: Page) => page.locator('meta[name="robots"]')

for (const hidden of hiddenRecipes) {
  test.describe(`a ${hidden.status} recipe`, () => {
    test('responds 404 to a signed-out visitor', async ({ page }) => {
      const response = await page.goto(`/recipes/${hidden.slug}`)

      expect(response?.status()).toBe(404)
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
      await expect(page.getByText(hidden.name)).toHaveCount(0)
    })

    test('responds 404 to a signed-in user who did not submit it', async ({ context, page }) => {
      await signInAs(context, { email: 'e2e-user@example.com', role: 'user' })

      const response = await page.goto(`/recipes/${hidden.slug}`)

      expect(response?.status()).toBe(404)
      await expect(page.getByText(hidden.name)).toHaveCount(0)
    })

    for (const viewer of [
      { who: 'its submitter', id: SEED_SUBMITTER_ID, email: 'e2e-submitter@example.com', role: 'user' as const },
      { who: 'an admin', email: 'e2e-admin@example.com', role: 'admin' as const },
    ]) {
      test(`shows to ${viewer.who} with a status banner, and is not indexed`, async ({ context, page }) => {
        await signInAs(context, viewer)

        const response = await page.goto(`/recipes/${hidden.slug}`)

        expect(response?.status()).toBe(200)
        await expect(page.getByRole('heading', { level: 1, name: hidden.name })).toBeVisible()
        await expect(page.getByText(hidden.status === 'pending' ? 'Pending review' : 'Rejected', { exact: true })).toBeVisible()
        await expect(robots(page)).toHaveAttribute('content', /noindex/)
      })
    }
  })
}

test('the pending banner says only the submitter and admins can see the recipe', async ({ context, page }) => {
  await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'e2e-submitter@example.com', role: 'user' })

  await page.goto(`/recipes/${pendingRecipe.slug}`)

  await expect(page.getByText('Pending review — only the submitter and admins can see this recipe.')).toBeVisible()
})

test('the rejected banner shows the rejection reason', async ({ context, page }) => {
  await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'e2e-submitter@example.com', role: 'user' })

  await page.goto(`/recipes/${rejectedRecipe.slug}`)

  await expect(page.getByText(`Rejected — ${rejectedRecipe.rejectionReason}`)).toBeVisible()
})

test('a published recipe has no status banner and no robots meta', async ({ page }) => {
  await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Pending review', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Rejected', { exact: true })).toHaveCount(0)
  await expect(robots(page)).toHaveCount(0)
})

test('an unknown slug responds 404', async ({ page }) => {
  const unknown = 'e2e-no-such-recipe'
  expect(seedRecipes.map((r) => r.slug)).not.toContain(unknown)

  const response = await page.goto(`/recipes/${unknown}`)

  expect(response?.status()).toBe(404)
})

// A hidden recipe's 404 must not reveal that the slug exists. Next streams
// the RSC rows in a varying order, so the bodies can't be compared byte for
// byte; what would give it away is metadata a missing slug lacks: robots, a
// title or link-preview tags.
test.describe('a hidden recipe, signed out', () => {
  const robotsMentions = (body: string) => body.split('robots').length - 1

  // Every <meta> tag and the <title>, minus per-response attributes, sorted.
  const metadataTags = (body: string) =>
    (body.match(/<meta\b[^>]*>|<title\b[^>]*>[^<]*<\/title>/g) ?? [])
      .map((tag) => tag.replace(/\s(?:nonce|id)="[^"]*"/g, ''))
      .sort()

  for (const hidden of hiddenRecipes) {
    test(`a ${hidden.status} recipe's 404 has the same title and meta tags as a missing slug's`, async ({ request }) => {
      const missing = 'e2e-no-such-recipe'
      expect(seedRecipes.map((r) => r.slug)).not.toContain(missing)

      const hiddenResponse = await request.get(`/recipes/${hidden.slug}`)
      const missingResponse = await request.get(`/recipes/${missing}`)

      expect(hiddenResponse.status()).toBe(404)
      expect(missingResponse.status()).toBe(404)
      const hiddenTags = metadataTags(await hiddenResponse.text())
      expect(hiddenTags.some((tag) => tag.startsWith('<title'))).toBe(true)
      expect(hiddenTags).toEqual(metadataTags(await missingResponse.text()))
    })
  }

  for (const hidden of hiddenRecipes) {
    test(`a ${hidden.status} recipe's 404 has the same robots metadata as a missing slug's`, async ({ request }) => {
      const missing = 'e2e-no-such-recipe'
      expect(seedRecipes.map((r) => r.slug)).not.toContain(missing)

      const hiddenResponse = await request.get(`/recipes/${hidden.slug}`)
      const missingResponse = await request.get(`/recipes/${missing}`)

      expect(hiddenResponse.status()).toBe(404)
      expect(missingResponse.status()).toBe(404)
      expect(robotsMentions(await hiddenResponse.text())).toBe(robotsMentions(await missingResponse.text()))
    })
  }
})

test('prep, cook and total time show with units', async ({ page }) => {
  const stew = seedRecipe('E2E Beef Stew')
  expect([stew.prepTime, stew.cookTime]).toEqual([20, 120])

  await page.goto(`/recipes/${stew.slug}`)

  await expect(factTerms(page)).toHaveText(['Prep', 'Cook', 'Total', 'Serves'])
  await expect(factValues(page)).toHaveText(['20 min', '2 hr', '2 hr 20 min', String(stew.servings)])
})

test.describe('the ingredient checklist', () => {
  const beef = (page: Page) => page.getByRole('checkbox', { name: '2 lb stewing beef', exact: true })

  test("each ingredient is a checkbox named by the ingredient's text", async ({ page }) => {
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

    const boxes = ingredientItems(page).getByRole('checkbox')
    await expect(boxes).toHaveCount(3)
    for (const [index, name] of ['2 lb stewing beef', '3 carrots', '4 cups beef stock'].entries()) {
      await expect(boxes.nth(index)).toHaveAccessibleName(name)
      await expect(boxes.nth(index)).not.toBeChecked()
    }
  })

  test("clicking an ingredient's label checks it, and clicking again unchecks it", async ({ page }) => {
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)
    const label = ingredientItems(page).getByText('2 lb stewing beef', { exact: true })

    await label.click()
    await expect(beef(page)).toBeChecked()
    await expect(page.getByRole('checkbox', { name: '3 carrots', exact: true })).not.toBeChecked()

    await label.click()
    await expect(beef(page)).not.toBeChecked()
  })

  // The skip link jumps past the header; the tag links come next, then the
  // Cook mode button, the servings stepper's two buttons, then the first ingredient.
  test('Tab reaches a checkbox and Space toggles it', async ({ page }) => {
    const stew = seedRecipe('E2E Beef Stew')
    await page.goto(`/recipes/${stew.slug}`)

    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    for (const index of stew.tags.keys()) {
      await page.keyboard.press('Tab')
      await expect(tagLinks(page).nth(index)).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Cook mode', exact: true })).toBeFocused()
    for (const name of ['Decrease servings', 'Increase servings']) {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(beef(page)).toBeFocused()

    await page.keyboard.press('Space')
    await expect(beef(page)).toBeChecked()
    await page.keyboard.press('Space')
    await expect(beef(page)).not.toBeChecked()
  })
})

test('printing hides the site header and checkboxes, keeps ingredients, steps and plain-text tags, and uses light colors in dark mode', async ({
  context,
  page,
}) => {
  const stew = seedRecipe('E2E Beef Stew')
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3100' }])
  await page.emulateMedia({ media: 'print' })

  await page.goto(`/recipes/${stew.slug}`)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('banner')).toBeHidden()
  await expect(ingredientItems(page)).toHaveText(['2 lb stewing beef', '3 carrots', '4 cups beef stock'])
  await expect(ingredientItems(page).first()).toBeVisible()
  await expect(ingredientItems(page).getByRole('checkbox').first()).toBeHidden()
  await expect(stepTexts(page)).toHaveText(stew.steps)
  await expect(stepTexts(page).first()).toBeVisible()
  await expect(tagItems(page)).toHaveText(stew.tags)
  await expect(tagLinks(page).first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 245, 250)')
})

test.describe('the tag links', () => {
  const tagLink = (page: Page, tag: string) => page.getByRole('link', { name: `Recipes tagged ${tag}`, exact: true })
  const tagHref = (tag: string) => listingHref({ tags: [tag], time: undefined, sort: 'newest', q: undefined })
  const recipeGridNames = (page: Page) =>
    page.getByRole('region', { name: 'Recipes', exact: true }).getByRole('heading', { level: 3 })

  test('each tag links to the list filtered by it, named with its context', async ({ page }) => {
    const stew = seedRecipe('E2E Beef Stew')

    await page.goto(`/recipes/${stew.slug}`)

    await expect(tagLinks(page)).toHaveCount(stew.tags.length)
    for (const tag of stew.tags) {
      await expect(tagLink(page, tag)).toHaveAttribute('href', tagHref(tag))
    }
    await expect(tagLink(page, 'beef')).toHaveAttribute('href', '/recipes?tag=beef')
  })

  // The pending recipe is tagged beef too, but the list only shows published recipes.
  test('clicking a tag shows the list filtered by it, with its checkbox checked', async ({ page }) => {
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

    await tagLink(page, 'beef').click()

    await expect(page).toHaveURL('/recipes?tag=beef')
    await expect(recipeGridNames(page)).toHaveText(['E2E Beef Burgers', 'E2E Beef Stew'])
    await page.getByRole('button', { name: 'Filters, 1 active', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'beef', exact: true })).toBeChecked()
  })

  test('a tag with a space and non-ASCII characters is encoded in the link', async ({ page }) => {
    const tag = 'crème brûlée'
    await insertRecipes([
      {
        ...seedRecipe('E2E Chicken Tacos'),
        _id: '65c000000000000000000001',
        name: 'E2E Crème Brûlée',
        slug: 'e2e-creme-brulee',
        tags: [tag],
      },
    ])

    await page.goto('/recipes/e2e-creme-brulee')

    await expect(tagLink(page, tag)).toHaveAttribute('href', '/recipes?tag=cr%C3%A8me+br%C3%BBl%C3%A9e')
    await expect(tagLink(page, tag)).toHaveAttribute('href', tagHref(tag))

    await tagLink(page, tag).click()

    await expect(recipeGridNames(page)).toHaveText(['E2E Crème Brûlée'])
    await page.getByRole('button', { name: 'Filters, 1 active', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: tag, exact: true })).toBeChecked()
  })

  // Below lg the 20px chip has a 44px target: a tap just above the chip still follows the link.
  test('on a phone, a tap just outside the chip follows its link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

    const box = (await tagLink(page, 'stew').boundingBox())!
    expect(box.height).toBeLessThan(44)
    await page.mouse.click(box.x + box.width / 2, box.y - 10)

    await expect(page).toHaveURL('/recipes?tag=stew')
  })
})

test.describe('the Edit link', () => {
  const editLink = (page: Page) => page.getByRole('link', { name: 'Edit', exact: true })

  test('an admin sees Edit, linking to the edit page', async ({ context, page }) => {
    const stew = seedRecipe('E2E Beef Stew')
    await signInAs(context, { email: 'e2e-admin@example.com', role: 'admin' })

    await page.goto(`/recipes/${stew.slug}`)

    await expect(editLink(page)).toHaveAttribute('href', `/recipes/${stew.slug}/edit`)
  })

  test("a signed-in non-admin sees no Edit on someone else's recipe", async ({ context, page }) => {
    await signInAs(context, { email: 'e2e-user@example.com', role: 'user' })

    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(editLink(page)).toHaveCount(0)
  })

  test('a signed-out visitor sees no Edit', async ({ page }) => {
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(editLink(page)).toHaveCount(0)
  })
})
