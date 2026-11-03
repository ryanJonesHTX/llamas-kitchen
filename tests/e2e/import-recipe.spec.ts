import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { recordNextActions } from './actions.ts'
import { signInAs } from './auth.ts'
import { deleteSessions, disconnect, findRecipe, reseed } from './db.ts'
import { seedRecipe } from './fixtures.ts'
import {
  addStepButton,
  addTags,
  formField,
  imageInput,
  imagePreview,
  imagePreviewSource,
  importBox,
  importButton,
  importFrom,
  importStatus,
  ingredientLine,
  openImportForm,
  recipeLinkInput,
  saveButton,
  stepField,
  tagChips,
} from './recipeForm.ts'
import { ingredientItems, stepTexts, tagItems } from './recipePage.ts'
import { recipeSiteUrl, releaseSlowPage } from './recipeSite.ts'
import { blockBrowserCloudinary, cloudinaryUploads, releaseSlowUpload, VALID_PNG } from './uploads.ts'

// Admins import a recipe page into the form on /new through the "Import from a
// link" box (components/ImportRecipe.tsx). The importRecipe action fetches the
// pages from the fake recipe site (tests/e2e/fake-recipe-site.ts) with the real
// fetcher, and the fake Cloudinary answers its photo upload by URL.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const HELP =
  'Paste a link to a recipe page. The form below fills in for you to check before saving. Importing replaces anything already in the form.'
const IMPORTED = 'Recipe imported. Check it over before saving.'
const PHOTO_NOTE = " The photo couldn't be imported, so add one below if you like."
const NOT_LOADED = "That link couldn't be loaded."
const IMPORT_FAILED = 'Something went wrong and the recipe was not imported. Reload the page and try again.'

// What tests/e2e/fake-recipe-site.ts serves at /lasagna, as the form shows it.
const lasagna = {
  url: recipeSiteUrl('lasagna'),
  slug: 'e2e-imported-lasagna',
  name: 'E2E Imported Lasagna',
  description: 'A rich, layered bake.',
  ingredients: ['12 lasagna sheets', '2 cups ricotta', '1 lb ground beef'],
  steps: ['Brown the beef.', 'Layer the sheets, ricotta and beef.', 'Bake for 45 minutes.'],
  tags: ['dinner', 'italian'],
  prepTime: '30',
  cookTime: '75',
  servings: '8',
  credit: 'Nonna Llama',
  imageUrl: 'https://images.e2e.test/lasagna.jpg',
  publicId: 'recipes/lasagna',
}

const ingredientRows = (page: Page) => page.getByLabel(/^Ingredient \d+$/)
const stepRows = (page: Page) => page.getByLabel(/^Step \d+$/)
const recipeForm = (page: Page) => page.locator('form', { has: saveButton(page) })
const importAlert = (page: Page) => importBox(page).getByRole('alert')

async function expectFormShowsLasagna(page: Page) {
  await expect(formField(page, 'Recipe name')).toHaveValue(lasagna.name)
  await expect(formField(page, 'Description')).toHaveValue(lasagna.description)
  await expect(ingredientRows(page)).toHaveCount(lasagna.ingredients.length)
  for (const [index, line] of lasagna.ingredients.entries()) await expect(ingredientLine(page, index + 1)).toHaveValue(line)
  await expect(stepRows(page)).toHaveCount(lasagna.steps.length)
  for (const [index, text] of lasagna.steps.entries()) await expect(stepField(page, index + 1)).toHaveValue(text)
  await expect(tagChips(page)).toHaveText(lasagna.tags)
  await expect(formField(page, 'Prep time (minutes)')).toHaveValue(lasagna.prepTime)
  await expect(formField(page, 'Cook time (minutes)')).toHaveValue(lasagna.cookTime)
  await expect(formField(page, 'Servings')).toHaveValue(lasagna.servings)
  await expect(formField(page, 'Credit')).toHaveValue(lasagna.credit)
}

// The error is in an alert under the input, which is marked invalid and points at it.
async function expectImportError(page: Page, message: string) {
  await expect(importAlert(page)).toHaveText(message)
  const id = await importAlert(page).getAttribute('id')
  expect(id, 'the alert has an id for aria-describedby').toBeTruthy()
  await expect(recipeLinkInput(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(recipeLinkInput(page)).toHaveAttribute('aria-describedby', new RegExp(`(^|\\s)${id}(\\s|$)`))
  await expect(importStatus(page)).toHaveText('')
}

// The /new form as it starts: one empty ingredient row, one empty step, no tags.
async function expectFormEmptyExceptName(page: Page, name: string) {
  await expect(formField(page, 'Recipe name')).toHaveValue(name)
  await expect(formField(page, 'Description')).toHaveValue('')
  await expect(ingredientRows(page)).toHaveCount(1)
  await expect(ingredientLine(page, 1)).toHaveValue('')
  await expect(stepRows(page)).toHaveCount(1)
  await expect(stepField(page, 1)).toHaveValue('')
  await expect(tagChips(page)).toHaveCount(0)
  await expect(formField(page, 'Servings')).toHaveValue('')
  await expect(imagePreview(page)).toHaveCount(0)
}

test.describe('who sees the box', () => {
  test('an admin sees "Import from a link" above the recipe form on /new, outside it', async ({ context, page }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
    await openImportForm(page)

    await expect(importBox(page).getByText(HELP, { exact: true })).toBeVisible()
    await expect(recipeLinkInput(page)).toHaveAttribute('type', 'url')
    await expect(recipeLinkInput(page)).toHaveAttribute('inputmode', 'url')
    await expect(recipeLinkInput(page)).toHaveAttribute('autocomplete', 'off')
    await expect(recipeLinkInput(page)).toHaveValue('')
    expect((await importButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(importStatus(page)).toHaveText('')
    // Forms can't nest: the box is its own form, above the recipe form.
    await expect(recipeForm(page).getByRole('heading', { name: 'Import from a link' })).toHaveCount(0)
    await expect(recipeForm(page).getByLabel('Recipe link')).toHaveCount(0)
    const box = (await importBox(page).boundingBox())!
    const form = (await recipeForm(page).boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(form.y)
  })

  test('a signed-in user who is not an admin sees no import box on /new', async ({ context, page }) => {
    await signInAs(context, { email: 'user@example.com', role: 'user' })
    await page.goto('/new')

    await expect(page.getByRole('button', { name: 'Submit for review', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Import from a link' })).toHaveCount(0)
    await expect(recipeLinkInput(page)).toHaveCount(0)
  })

  test("an admin sees no import box on a recipe's edit page", async ({ context, page }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
    await page.goto(`/recipes/${seedRecipe('E2E Beef Stew').slug}/edit`)

    await expect(page.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Import from a link' })).toHaveCount(0)
    await expect(recipeLinkInput(page)).toHaveCount(0)
  })
})

test.describe('signed in as admin', () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  })

  test('importing a full recipe page fills every field of the form', async ({ page }) => {
    await openImportForm(page)

    await importFrom(page, lasagna.url)

    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expectFormShowsLasagna(page)
  })

  test("importing a page with a photo shows Cloudinary's copy in the preview, uploaded once by URL", async ({
    page,
  }) => {
    const browserCloudinaryCalls = await blockBrowserCloudinary(page)
    await openImportForm(page)

    await importFrom(page, lasagna.url)

    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(imagePreview(page)).toBeVisible()
    expect(await imagePreviewSource(page)).toMatch(new RegExp(`^https://res\\.cloudinary\\.com/.+/${lasagna.publicId}$`))
    const uploads = cloudinaryUploads()
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toMatchObject({ file: { url: lasagna.imageUrl }, publicId: lasagna.publicId })
    for (const name of ['signature', 'api_key', 'timestamp']) expect(uploads[0].fields[name], name).toBeTruthy()
    expect(browserCloudinaryCalls).toEqual([])
  })

  test('pressing Enter in the link input imports, says so in the status, clears the input and keeps focus there', async ({
    page,
  }) => {
    await openImportForm(page)

    await recipeLinkInput(page).fill(lasagna.url)
    await recipeLinkInput(page).press('Enter')

    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(recipeLinkInput(page)).toHaveValue('')
    await expect(recipeLinkInput(page)).toBeFocused()
    await expect(importAlert(page)).toHaveCount(0)
  })

  test('saving an imported recipe publishes it with the imported content and links to the page as its Source', async ({
    page,
  }) => {
    await openImportForm(page)
    await importFrom(page, lasagna.url)
    await expect(importStatus(page)).toHaveText(IMPORTED)

    await saveButton(page).click()

    await expect(page).toHaveURL(`/recipes/${lasagna.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: lasagna.name })).toBeVisible()
    await expect(page.getByText(lasagna.description)).toBeVisible()
    await expect(ingredientItems(page)).toHaveText(lasagna.ingredients)
    await expect(stepTexts(page)).toHaveText(lasagna.steps)
    await expect(tagItems(page)).toHaveText(lasagna.tags)
    await expect(page.getByText(`Recipe from ${lasagna.credit}`)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', lasagna.url)
    expect(await findRecipe({ slug: lasagna.slug })).toMatchObject({
      status: 'published',
      sourceUrl: lasagna.url,
      imagePublicId: lasagna.publicId,
      prepTime: 30,
      cookTime: 75,
      servings: 8,
      credit: lasagna.credit,
    })
  })

  test("a link that redirects saves the final page's URL as the source", async ({ page }) => {
    await openImportForm(page)
    await importFrom(page, recipeSiteUrl('redirect'))
    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(formField(page, 'Recipe name')).toHaveValue(lasagna.name)

    await saveButton(page).click()

    await expect(page).toHaveURL(`/recipes/${lasagna.slug}`)
    await expect(page.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', lasagna.url)
    expect((await findRecipe({ slug: lasagna.slug }))?.sourceUrl).toBe(lasagna.url)
  })

  test('a page without a photo imports with no upload and no photo note', async ({ page }) => {
    await openImportForm(page)

    await importFrom(page, recipeSiteUrl('no-photo'))

    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(formField(page, 'Recipe name')).toHaveValue('E2E Imported Soup')
    await expect(stepRows(page)).toHaveCount(2)
    await expect(imagePreview(page)).toHaveCount(0)
    await expect(imageInput(page)).toBeAttached()
    expect(cloudinaryUploads()).toEqual([])
  })

  test("a photo Cloudinary can't fetch still fills the form, and the status says to add one", async ({ page }) => {
    await openImportForm(page)

    await importFrom(page, recipeSiteUrl('photo-fails'))

    await expect(importStatus(page)).toHaveText(IMPORTED + PHOTO_NOTE)
    await expect(formField(page, 'Recipe name')).toHaveValue('E2E Imported Pie')
    await expect(ingredientLine(page, 2)).toHaveValue('1 pie crust')
    await expect(imagePreview(page)).toHaveCount(0)
    await expect(imageInput(page)).toBeAttached()
    await expect(importAlert(page)).toHaveCount(0)
  })

  test('a page with no recipe shows "No recipe found on that page." and leaves the form untouched', async ({
    page,
  }) => {
    await openImportForm(page)
    await formField(page, 'Recipe name').fill('My own draft')

    await importFrom(page, recipeSiteUrl('not-a-recipe'))

    await expectImportError(page, 'No recipe found on that page.')
    await expect(recipeLinkInput(page)).toHaveValue(recipeSiteUrl('not-a-recipe'))
    await expectFormEmptyExceptName(page, 'My own draft')
  })

  test(`a page that answers 404 shows "${NOT_LOADED}"`, async ({ page }) => {
    await openImportForm(page)

    await importFrom(page, recipeSiteUrl('missing'))

    await expectImportError(page, NOT_LOADED)
    await expectFormEmptyExceptName(page, '')
  })

  test(`a link to a loopback address is refused by the fetcher with "${NOT_LOADED}"`, async ({ page }) => {
    await openImportForm(page)

    await importFrom(page, 'http://127.0.0.1/')

    await expectImportError(page, NOT_LOADED)
    await expectFormEmptyExceptName(page, '')
  })

  test('a javascript: link is refused by the server with the link error', async ({ page }) => {
    await openImportForm(page)
    const actions = recordNextActions(page)

    await importFrom(page, 'javascript:alert(1)')

    await expectImportError(page, 'Enter a link that starts with http:// or https://.')
    // The server owns URL validation.
    expect(actions).toHaveLength(1)
    await expectFormEmptyExceptName(page, '')
  })

  test('importing with an empty link shows "Paste a link to import." and sends nothing', async ({ page }) => {
    await openImportForm(page)
    const actions = recordNextActions(page)

    await importButton(page).click()

    await expectImportError(page, 'Paste a link to import.')
    expect(actions).toEqual([])
  })

  test('when the import action throws (the session ended), an alert says the recipe was not imported', async ({
    page,
  }) => {
    await openImportForm(page)
    await deleteSessions()

    await importFrom(page, lasagna.url)

    await expectImportError(page, IMPORT_FAILED)
    await expectFormEmptyExceptName(page, '')
    expect(cloudinaryUploads()).toEqual([])
  })

  // The fake site holds /slow until releaseSlowPage().
  test('while an import runs, the button reads "Importing…", it and Save are disabled and the input is read-only', async ({
    page,
  }) => {
    await openImportForm(page)
    await expect(saveButton(page)).toBeEnabled()

    await importFrom(page, recipeSiteUrl('slow'))

    const importing = importBox(page).getByRole('button', { name: 'Importing…', exact: true })
    await expect(importing).toBeDisabled()
    await expect(recipeLinkInput(page)).toHaveAttribute('readonly')
    await expect(saveButton(page)).toBeDisabled()
    await expect(importStatus(page)).toHaveText('')
    releaseSlowPage()
    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(formField(page, 'Recipe name')).toHaveValue('E2E Imported Slow Stew')
    await expect(importButton(page)).toBeEnabled()
    await expect(recipeLinkInput(page)).not.toHaveAttribute('readonly')
    await expect(saveButton(page)).toBeEnabled()
  })

  // An import replaces the image, so it can't overlap an upload.
  test('while an image uploads, Import is disabled', async ({ page }) => {
    await openImportForm(page)

    await imageInput(page).setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: VALID_PNG })

    await expect(page.getByRole('status').filter({ hasText: 'Uploading…' })).toBeVisible()
    await expect(importButton(page)).toBeDisabled()
    releaseSlowUpload()
    await expect(page.getByText('Image uploaded!')).toBeVisible()
    await expect(importButton(page)).toBeEnabled()
  })

  test('while an import runs, the photo input is disabled', async ({ page }) => {
    await openImportForm(page)
    await expect(imageInput(page)).toBeEnabled()

    await importFrom(page, recipeSiteUrl('slow'))

    await expect(importBox(page).getByRole('button', { name: 'Importing…', exact: true })).toBeDisabled()
    await expect(imageInput(page)).toBeDisabled()
    releaseSlowPage()
    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(imageInput(page)).toBeEnabled()
  })

  test('starting a new import clears the previous status', async ({ page }) => {
    await openImportForm(page)
    await importFrom(page, lasagna.url)
    await expect(importStatus(page)).toHaveText(IMPORTED)

    await importFrom(page, recipeSiteUrl('slow'))

    await expect(importBox(page).getByRole('button', { name: 'Importing…', exact: true })).toBeDisabled()
    await expect(importStatus(page)).toHaveText('')
    releaseSlowPage()
    await expect(importStatus(page)).toHaveText(IMPORTED)
  })

  test('starting a new import clears the previous error', async ({ page }) => {
    await openImportForm(page)
    await importFrom(page, recipeSiteUrl('not-a-recipe'))
    await expect(importAlert(page)).toHaveText('No recipe found on that page.')

    await importFrom(page, lasagna.url)

    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expect(importAlert(page)).toHaveCount(0)
    await expect(recipeLinkInput(page)).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('importing over a half-filled form replaces its content, rows, tags, notes and uploaded image', async ({
    page,
  }) => {
    await openImportForm(page)
    await formField(page, 'Recipe name').fill('My own draft')
    await formField(page, 'Description').fill('Half written.')
    for (let n = 1; n <= 5; n++) {
      if (n > 1) await page.getByRole('button', { name: 'Add ingredient', exact: true }).click()
      await ingredientLine(page, n).fill(`${n} draft things`)
    }
    for (let n = 1; n <= 4; n++) {
      if (n > 1) await addStepButton(page).click()
      await stepField(page, n).fill(`Draft step ${n}.`)
    }
    await addTags(page, ['draft', 'soup', 'quick'])
    await formField(page, 'Notes').fill('Draft notes.')
    await formField(page, 'Credit').fill('Me')
    await imageInput(page).setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer: VALID_PNG })
    await expect(page.getByText('Image uploaded!')).toBeVisible()

    await importFrom(page, lasagna.url)

    await expect(importStatus(page)).toHaveText(IMPORTED)
    await expectFormShowsLasagna(page)
    await expect(formField(page, 'Notes')).toHaveValue('')
    await expect(page.getByText('Image uploaded!')).toBeHidden()
    expect(await imagePreviewSource(page)).toMatch(new RegExp(`/${lasagna.publicId}$`))
  })

  test('the input and the Import button share a row on a wide screen and stack at 390px', async ({ page }) => {
    await openImportForm(page)
    const input = (await recipeLinkInput(page).boundingBox())!
    const button = (await importButton(page).boundingBox())!
    expect(button.x).toBeGreaterThanOrEqual(input.x + input.width)
    expect(button.y).toBeLessThan(input.y + input.height)

    await page.setViewportSize({ width: 390, height: 844 })

    const narrowInput = (await recipeLinkInput(page).boundingBox())!
    const narrowButton = (await importButton(page).boundingBox())!
    expect(narrowButton.y).toBeGreaterThanOrEqual(narrowInput.y + narrowInput.height)
  })

  test('the import box is hidden when printing', async ({ page }) => {
    await openImportForm(page)

    await page.emulateMedia({ media: 'print' })

    await expect(importBox(page)).toBeHidden()
    await expect(formField(page, 'Recipe name')).toBeVisible()
  })
})
