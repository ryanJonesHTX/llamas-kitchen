import type { Page } from '@playwright/test'

// The recipe form (components/RecipeForm.tsx) on /new and /recipes/<slug>/edit.
// Every field is found by its exact label; the labels are the contract.

export const formField = (page: Page, label: string) => page.getByLabel(label, { exact: true })

// Ingredient lines are numbered from 1: "Ingredient 1", "Ingredient 2", ...
export const ingredientLine = (page: Page, n: number) => formField(page, `Ingredient ${n}`)

// Each ingredient's drag handle, also operable from the keyboard (Space, arrows, Space).
export const reorderHandle = (page: Page, n: number) =>
  page.getByRole('button', { name: `Reorder ingredient ${n}`, exact: true })

// The tag input is a combobox labelled "Tags"; its chips are the "Selected tags" list.
export const tagInput = (page: Page) => page.getByRole('combobox', { name: 'Tags', exact: true })

export const tagChips = (page: Page) =>
  page.getByRole('list', { name: 'Selected tags', exact: true }).getByRole('listitem')

export const removeTagButton = (page: Page, tag: string) =>
  page.getByRole('button', { name: `Remove tag ${tag}`, exact: true })

// Types each tag and presses Enter, which adds it as a chip.
export async function addTags(page: Page, tags: string[]): Promise<void> {
  for (const tag of tags) {
    await tagInput(page).fill(tag)
    await tagInput(page).press('Enter')
  }
}

// The file input is "Upload an image" until the form has an image, then "Replace image".
export const imageInput = (page: Page) => formField(page, 'Upload an image')

export const replaceImageInput = (page: Page) => formField(page, 'Replace image')

export const imagePreview = (page: Page) => page.getByRole('img', { name: 'Recipe photo preview', exact: true })

// The image URL behind the preview. next/image serves remote images through
// /_next/image?url=<encoded URL>; local object URLs (blob:) are used as is.
export async function imagePreviewSource(page: Page): Promise<string> {
  const src = await imagePreview(page).getAttribute('src')
  if (!src) throw new Error('the image preview has no src')
  if (src.startsWith('blob:')) return src
  const url = new URL(src, 'http://localhost').searchParams.get('url')
  if (!url) throw new Error(`the image preview src is not a next/image URL: ${src}`)
  return url
}

export const saveButton = (page: Page) => page.getByRole('button', { name: 'Save recipe', exact: true })

// Upload errors are announced in an alert. Next.js has its own (empty)
// route-announcer alert, so match on text.
export const alertWith = (page: Page, text: RegExp) => page.getByRole('alert').filter({ hasText: text })

export const newRecipe = {
  name: 'E2E Added Lasagna',
  slug: 'e2e-added-lasagna',
  description: 'Layered pasta bake.',
  ingredients: ['12 lasagna sheets', '2 cups ricotta'],
  steps: ['Layer the sheets and sauce.', 'Bake for 45 minutes.'],
  tags: ['Pasta', 'Bake'],
  servings: '6',
  prepTime: '30',
  cookTime: '45',
  credit: 'Aunt Llama',
}

// Fills every field of the form on /new except the image.
export async function fillNewRecipe(page: Page): Promise<void> {
  await formField(page, 'Recipe name').fill(newRecipe.name)
  await formField(page, 'Description').fill(newRecipe.description)
  // /new starts with one empty ingredient line.
  await ingredientLine(page, 1).fill(newRecipe.ingredients[0])
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click()
  await ingredientLine(page, 2).fill(newRecipe.ingredients[1])
  await formField(page, 'Steps').fill(newRecipe.steps.join('\n'))
  await addTags(page, newRecipe.tags)
  await formField(page, 'Servings').fill(newRecipe.servings)
  await formField(page, 'Prep time (minutes)').fill(newRecipe.prepTime)
  await formField(page, 'Cook time (minutes)').fill(newRecipe.cookTime)
  await formField(page, 'Credit').fill(newRecipe.credit)
}
