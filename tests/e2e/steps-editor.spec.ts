import type { Page } from '@playwright/test'
import { MAX_RECIPE_STEP_LENGTH } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, findRecipe, insertRecipes, reseed } from './db.ts'
import { seedRecipe } from './fixtures.ts'
import {
  addStepButton,
  fillNewRecipe,
  fillSteps,
  ingredientLine,
  newRecipe,
  removeStepButton,
  reorderHandle,
  reorderStepHandle,
  saveButton,
  stepField,
} from './recipeForm.ts'
import { ingredientItems, stepTexts } from './recipePage.ts'

// The Steps card of components/RecipeForm.tsx: one growing textarea per step,
// sortable and removable like the ingredient rows.

test.beforeEach(async ({ context }) => {
  await reseed()
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')

// dnd-kit ignores keys sent before it has measured the rows, so each key waits for its announcement.
const announced = (page: Page, text: string) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeAttached()

// The visible step numbers: hidden from screen readers, whose "Step N" is the label.
const stepNumbers = (page: Page) =>
  page.getByRole('list', { name: 'Steps', exact: true }).locator('li > [aria-hidden="true"]')

test('a new recipe starts with one empty step', async ({ page }) => {
  await page.goto('/new')

  await expect(stepField(page, 1)).toHaveValue('')
  await expect(stepField(page, 2)).toHaveCount(0)
  await expect(reorderStepHandle(page, 1)).toBeVisible()
  await expect(removeStepButton(page, 1)).toBeVisible()
})

test('Add step appends an empty step and moves focus into it', async ({ page }) => {
  await page.goto('/new')
  await stepField(page, 1).fill('Boil the water.')

  await addStepButton(page).click()

  await expect(stepField(page, 2)).toHaveValue('')
  await expect(stepField(page, 2)).toBeFocused()
  await expect(stepField(page, 1)).toHaveValue('Boil the water.')
})

test('Remove step N removes that step and renumbers the ones after it', async ({ page }) => {
  await page.goto('/new')
  await fillSteps(page, ['First.', 'Second.', 'Third.'])
  await expect(stepNumbers(page)).toHaveText(['1', '2', '3'])

  await removeStepButton(page, 1).click()

  await expect(stepField(page, 1)).toHaveValue('Second.')
  await expect(stepField(page, 2)).toHaveValue('Third.')
  await expect(stepField(page, 3)).toHaveCount(0)
  await expect(removeStepButton(page, 3)).toHaveCount(0)
  await expect(stepNumbers(page)).toHaveText(['1', '2'])
})

test('Enter inside a step adds a line break to that step, not a new step', async ({ page }) => {
  await page.goto('/new')

  await stepField(page, 1).click()
  await page.keyboard.type('Line one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Line two')

  await expect(stepField(page, 1)).toHaveValue('Line one\nLine two')
  await expect(stepField(page, 2)).toHaveCount(0)
})

test('a step grows with its content: a five-line step is taller than a one-line step', async ({ page }) => {
  await page.goto('/new')
  await fillSteps(page, ['One line.', 'One.\nTwo.\nThree.\nFour.\nFive.'])

  const oneLine = await stepField(page, 1).boundingBox()
  const fiveLines = await stepField(page, 2).boundingBox()
  expect(fiveLines!.height).toBeGreaterThan(oneLine!.height)
})

test('a step with line breaks is saved with them and the recipe page shows them as line breaks', async ({ page }) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await stepField(page, 1).fill('Layer the sheets.\nThen the sauce.')
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  expect((await findRecipe({ slug: newRecipe.slug }))?.steps).toEqual([
    'Layer the sheets.\nThen the sauce.',
    newRecipe.steps[1],
  ])
  // innerText follows the rendering: a collapsed newline would read as a space.
  expect(await stepTexts(page).first().innerText()).toBe('Layer the sheets.\nThen the sauce.')
})

test('blank steps are dropped on save', async ({ page }) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await addStepButton(page).click()
  await stepField(page, 3).fill('   ')
  await addStepButton(page).click()
  await stepField(page, 4).fill('Serve hot.')
  await addStepButton(page).click()
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  await expect(stepTexts(page)).toHaveText([...newRecipe.steps, 'Serve hot.'])
  expect((await findRecipe({ slug: newRecipe.slug }))?.steps).toEqual([...newRecipe.steps, 'Serve hot.'])
})

test('a recipe with only blank steps shows the "at least one step" error on Step 1, focuses it and saves nothing', async ({
  page,
}) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await stepField(page, 1).fill('')
  await stepField(page, 2).fill('  ')
  await saveButton(page).click()

  await expect(stepField(page, 1)).toHaveAccessibleDescription('Add at least one step')
  await expect(stepField(page, 1)).toBeFocused()
  await expect(page).toHaveURL('/new')
  expect(await findRecipe({ slug: newRecipe.slug })).toBeNull()
})

// The step's error is filed under its index; the form shows it under the
// list and focuses that step.
test('an over-long step shows its error, focuses that step and saves nothing', async ({ page }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)
  const before = await findRecipe({ _id: stew._id })

  await stepField(page, 2).fill('x'.repeat(MAX_RECIPE_STEP_LENGTH + 1))
  await saveButton(page).click()

  await expect(stepField(page, 2)).toHaveAccessibleDescription(
    new RegExp(`each step must be at most ${MAX_RECIPE_STEP_LENGTH} characters`)
  )
  await expect(stepField(page, 2)).toBeFocused()
  await expect(page).toHaveURL(`/recipes/${stew.slug}/edit`)
  expect(await findRecipe({ _id: stew._id })).toEqual(before)
})

// The schema numbers non-blank steps only; a blank row before the bad step
// must not move the error onto the wrong row.
test('an over-long step after a blank row gets the error and focus, not the row at its non-blank index', async ({
  page,
}) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await stepField(page, 1).fill('Boil.')
  await stepField(page, 2).fill('   ')
  await addStepButton(page).click()
  await stepField(page, 3).fill('x'.repeat(MAX_RECIPE_STEP_LENGTH + 1))
  await saveButton(page).click()

  await expect(stepField(page, 3)).toHaveAccessibleDescription(
    new RegExp(`each step must be at most ${MAX_RECIPE_STEP_LENGTH} characters`)
  )
  await expect(stepField(page, 3)).toBeFocused()
  await expect(stepField(page, 1)).not.toHaveAttribute('aria-invalid')
  await expect(stepField(page, 2)).not.toHaveAttribute('aria-invalid')
  await expect(page).toHaveURL('/new')
  expect(await findRecipe({ slug: newRecipe.slug })).toBeNull()
})

test('the edit form shows one step per stored step, in order, line breaks included', async ({ page }) => {
  const layered = {
    ...stew,
    _id: '65a0000000000000000000fe',
    name: 'E2E Layered Stew',
    slug: 'e2e-layered-stew',
    steps: ['Brown the beef.\nIn batches.', 'Add the stock.', 'Simmer for two hours.'],
  }
  await insertRecipes([layered])

  await page.goto(`/recipes/${layered.slug}/edit`)

  await expect(stepField(page, 1)).toHaveValue('Brown the beef.\nIn batches.')
  await expect(stepField(page, 2)).toHaveValue('Add the stock.')
  await expect(stepField(page, 3)).toHaveValue('Simmer for two hours.')
  await expect(stepField(page, 4)).toHaveCount(0)
})

test('a step moved with the keyboard (Space, ArrowUp twice, Space) is announced and saved in its new place', async ({
  page,
}) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await addStepButton(page).click()
  await stepField(page, 3).fill('Preheat the oven.')

  await reorderStepHandle(page, 3).focus()
  await page.keyboard.press('Space')
  await announced(page, 'Picked up step 3.')
  await page.keyboard.press('ArrowUp')
  await announced(page, 'Step 3 moved to position 2.')
  await page.keyboard.press('ArrowUp')
  await announced(page, 'Step 3 moved to position 1.')
  await page.keyboard.press('Space')
  await announced(page, 'Step 3 dropped at position 1.')

  await expect(stepField(page, 1)).toHaveValue('Preheat the oven.')
  await expect(stepField(page, 2)).toHaveValue(newRecipe.steps[0])
  await expect(stepField(page, 3)).toHaveValue(newRecipe.steps[1])
  // The ingredients don't move with the steps.
  await expect(ingredientLine(page, 1)).toHaveValue(newRecipe.ingredients[0])
  await expect(ingredientLine(page, 2)).toHaveValue(newRecipe.ingredients[1])
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  await expect(stepTexts(page)).toHaveText(['Preheat the oven.', ...newRecipe.steps])
  await expect(ingredientItems(page)).toHaveText(newRecipe.ingredients)
})

test('Escape cancels a step move, announces it and leaves the steps in place', async ({ page }) => {
  await page.goto('/new')
  await fillSteps(page, ['First.', 'Second.'])

  await reorderStepHandle(page, 1).focus()
  await page.keyboard.press('Space')
  await announced(page, 'Picked up step 1.')
  await page.keyboard.press('ArrowDown')
  await announced(page, 'Step 1 moved to position 2.')
  await page.keyboard.press('Escape')
  await announced(page, 'Reordering cancelled. Step 1 is back in place.')

  await expect(stepField(page, 1)).toHaveValue('First.')
  await expect(stepField(page, 2)).toHaveValue('Second.')
})

test('the step and ingredient handles each describe how to pick up their own kind of row', async ({ page }) => {
  await page.goto('/new')

  await expect(reorderStepHandle(page, 1)).toHaveAccessibleDescription(/^To pick up a step, /)
  await expect(reorderHandle(page, 1)).toHaveAccessibleDescription(/^To pick up an ingredient, /)
})

test('moving an ingredient leaves the steps in place and announces an ingredient', async ({ page }) => {
  await page.goto('/new')
  await fillNewRecipe(page)

  await reorderHandle(page, 2).focus()
  await page.keyboard.press('Space')
  await announced(page, 'Picked up ingredient 2.')
  await page.keyboard.press('ArrowUp')
  await announced(page, 'Ingredient 2 moved to position 1.')
  await page.keyboard.press('Space')
  await announced(page, 'Ingredient 2 dropped at position 1.')

  await expect(ingredientLine(page, 1)).toHaveValue(newRecipe.ingredients[1])
  await expect(stepField(page, 1)).toHaveValue(newRecipe.steps[0])
  await expect(stepField(page, 2)).toHaveValue(newRecipe.steps[1])
})
