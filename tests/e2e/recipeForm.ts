import type { Page } from '@playwright/test'
import { expect } from './test.ts'

// The recipe form (components/RecipeForm.tsx) on /new and /recipes/<slug>/edit.
// Every field is found by its exact label; the labels are the contract.

export const formField = (page: Page, label: string) => page.getByLabel(label, { exact: true })

// Ingredient lines are numbered from 1: "Ingredient 1", "Ingredient 2", ...
export const ingredientLine = (page: Page, n: number) => formField(page, `Ingredient ${n}`)

// Each ingredient's drag handle, also operable from the keyboard (Space, arrows, Space).
export const reorderHandle = (page: Page, n: number) =>
  page.getByRole('button', { name: `Reorder ingredient ${n}`, exact: true })

// Steps are a list of textareas too, numbered from 1: "Step 1", "Step 2", ...
// Each has a "Reorder step N" handle and a "Remove step N" button.
export const stepField = (page: Page, n: number) => formField(page, `Step ${n}`)

export const reorderStepHandle = (page: Page, n: number) =>
  page.getByRole('button', { name: `Reorder step ${n}`, exact: true })

export const removeStepButton = (page: Page, n: number) =>
  page.getByRole('button', { name: `Remove step ${n}`, exact: true })

export const addStepButton = (page: Page) => page.getByRole('button', { name: 'Add step', exact: true })

// Fills one step per row on a form that starts with one empty step (/new),
// adding a row for each step after the first.
export async function fillSteps(page: Page, steps: string[]): Promise<void> {
  for (const [index, step] of steps.entries()) {
    if (index > 0) await addStepButton(page).click()
    await stepField(page, index + 1).fill(step)
  }
}

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
  await fillSteps(page, newRecipe.steps)
  await addTags(page, newRecipe.tags)
  await formField(page, 'Servings').fill(newRecipe.servings)
  await formField(page, 'Prep time (minutes)').fill(newRecipe.prepTime)
  await formField(page, 'Cook time (minutes)').fill(newRecipe.cookTime)
  await formField(page, 'Credit').fill(newRecipe.credit)
}

// The admin-only "Import from a link" box above the form on /new
// (components/ImportRecipe.tsx): its own small form, outside the recipe form.
export const importBox = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Import from a link', exact: true }) })

export const recipeLinkInput = (page: Page) => formField(page, 'Recipe link')

export const importButton = (page: Page) => page.getByRole('button', { name: 'Import', exact: true })

// The box's live region; empty until an import succeeds.
export const importStatus = (page: Page) => importBox(page).getByRole('status')

// Opens /new and waits until the Import button is hydrated, so a submit is
// never lost to the browser's own form submission.
export async function openImportForm(page: Page): Promise<void> {
  await page.goto('/new')
  await expect(importButton(page)).toBeVisible()
  await expect
    .poll(() => importButton(page).evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
    .toBe(true)
}

// Pastes a link into the box and presses Import.
export async function importFrom(page: Page, url: string): Promise<void> {
  await recipeLinkInput(page).fill(url)
  await importButton(page).click()
}
