import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { deleteSessions, disconnect, findRecipe, reseed } from './db.ts'
import { pendingRecipe, SEED_ADMIN_ID, seedRecipe } from './fixtures.ts'
import { alertWith, fillNewRecipe, formField, imageInput, ingredientLine, newRecipe, saveButton } from './recipeForm.ts'
import { factTerms, factValues, ingredientItems, stepsList, stepTexts, tagItems } from './recipePage.ts'
import { cloudinaryUploads, VALID_PNG } from './uploads.ts'

// Admin create and edit through components/RecipeForm.tsx.

let adminId: string

test.beforeEach(async ({ context }) => {
  await reseed()
  adminId = await signInAs(context, { email: 'admin@example.com', role: 'admin' })
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')

test('admin creates a recipe with an image on /new and lands on its page', async ({ page }) => {
  await page.goto('/new')
  // The slug is made from the name; only the edit page lets an admin change it.
  await expect(formField(page, 'Slug')).toHaveCount(0)

  await fillNewRecipe(page)
  await imageInput(page).setInputFiles({ name: 'lasagna.png', mimeType: 'image/png', buffer: VALID_PNG })
  await expect(page.getByText('Image uploaded!')).toBeVisible()
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: newRecipe.name })).toBeVisible()
  await expect(ingredientItems(page)).toHaveText(newRecipe.ingredients)
  await expect(stepsList(page)).toHaveJSProperty('tagName', 'OL')
  await expect(stepsList(page).getByRole('listitem')).toHaveCount(newRecipe.steps.length)
  await expect(stepTexts(page)).toHaveText(newRecipe.steps)
  await expect(tagItems(page)).toHaveText(['pasta', 'bake'])
  await expect(factTerms(page).last()).toHaveText('Serves')
  await expect(factValues(page).last()).toHaveText(String(newRecipe.servings))

  const saved = await findRecipe({ slug: newRecipe.slug })
  expect(saved).toMatchObject({
    status: 'published',
    imagePublicId: cloudinaryUploads()[0].publicId,
    ingredients: [
      { quantity: 12, unit: null, item: 'lasagna sheets' },
      { quantity: 2, unit: 'cups', item: 'ricotta' },
    ],
    servings: 6,
    credit: newRecipe.credit,
  })
  expect(saved?.submittedBy.toHexString()).toBe(adminId)
  expect(saved?.publishedAt).toBeInstanceOf(Date)
})

test('the Notes field on /new is saved with the new recipe', async ({ page }) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await formField(page, 'Notes').fill('Rest it for ten minutes.')
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  expect((await findRecipe({ slug: newRecipe.slug }))?.notes).toBe('Rest it for ten minutes.')
})

// The edit changes only ingredients and the slug; every other field, shown
// in the form or not, must survive the save.
test('admin edits the ingredients and the slug; the new slug works, the old one 404s, and every other field is kept', async ({
  page,
}) => {
  const newSlug = 'e2e-hearty-beef-stew'
  await page.goto(`/recipes/${stew.slug}/edit`)
  await expect(ingredientLine(page, 1)).toHaveValue('2 lb stewing beef')
  await expect(ingredientLine(page, 2)).toHaveValue('3 carrots')
  await expect(ingredientLine(page, 3)).toHaveValue('4 cups beef stock')
  await expect(formField(page, 'Slug')).toHaveValue(stew.slug)

  await ingredientLine(page, 1).fill('3 lb stewing beef')
  await page.getByRole('button', { name: 'Remove ingredient 2', exact: true }).click()
  await formField(page, 'Slug').fill(newSlug)
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newSlug}`)
  await expect(ingredientItems(page)).toHaveText(['3 lb stewing beef', '4 cups beef stock'])
  expect((await page.goto(`/recipes/${stew.slug}`))?.status()).toBe(404)

  const saved = await findRecipe({ _id: stew._id })
  expect(saved).toMatchObject({
    slug: newSlug,
    status: 'published',
    publishedAt: stew.publishedAt,
    steps: stew.steps,
    notes: stew.notes,
    sourceUrl: stew.sourceUrl,
    imagePublicId: stew.imagePublicId,
    credit: stew.credit,
    tags: stew.tags,
    ingredients: [
      { quantity: 3, unit: 'lb', item: 'stewing beef' },
      { quantity: 4, unit: 'cups', item: 'beef stock' },
    ],
  })
  expect(saved?.submittedBy.toHexString()).toBe(SEED_ADMIN_ID)
})

test('saving a slug another recipe holds (even a pending one) shows the error on the Slug field and saves nothing', async ({
  page,
}) => {
  await page.goto(`/recipes/${stew.slug}/edit`)

  await formField(page, 'Slug').fill(pendingRecipe.slug)
  await saveButton(page).click()

  await expect(formField(page, 'Slug')).toHaveAccessibleDescription(/another recipe already uses this slug/)
  await expect(page).toHaveURL(`/recipes/${stew.slug}/edit`)
  expect((await findRecipe({ _id: stew._id }))?.slug).toBe(stew.slug)
})

test('the Notes field on edit is pre-filled and saves a change', async ({ page }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)
  await expect(formField(page, 'Notes')).toHaveValue(stew.notes!)

  await formField(page, 'Notes').fill('Freezes well.')
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  expect((await findRecipe({ _id: stew._id }))?.notes).toBe('Freezes well.')
})

test('clearing the Notes field on edit removes the notes', async ({ page }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)

  await formField(page, 'Notes').fill('')
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  expect(await findRecipe({ _id: stew._id })).not.toHaveProperty('notes')
})

test('when the save action throws (the session ended), an alert says the recipe was not saved and nothing changes', async ({
  page,
}) => {
  await page.goto(`/recipes/${stew.slug}/edit`)
  const before = await findRecipe({ _id: stew._id })
  await formField(page, 'Description').fill('Never saved.')
  await deleteSessions()

  await saveButton(page).click()

  await expect(alertWith(page, /Something went wrong and the recipe was not saved/)).toBeVisible()
  await expect(page).toHaveURL(`/recipes/${stew.slug}/edit`)
  expect(await findRecipe({ _id: stew._id })).toEqual(before)
})
