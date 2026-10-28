import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { disconnect, insertRecipes, reseed } from './db.ts'
import { seedRecipe, type SeedRecipe } from './fixtures.ts'
import { factValues, ingredientItems, openRecipe, tagLinks } from './recipePage.ts'

// The servings stepper on the recipe page: choosing servings scales the
// ingredient lines on the page only (lib/recipes/scale.ts). Expected lines are
// written out by hand so the tests pin the scaling rules.

test.beforeEach(async () => {
  await reseed()
  await insertRecipes([pancakes, crowdRice, banquetSugar])
})

test.afterAll(async () => {
  await disconnect()
})

const base = seedRecipe('E2E Beef Stew')
const recipe = (overrides: Partial<SeedRecipe> & Pick<SeedRecipe, '_id' | 'name' | 'slug'>): SeedRecipe => ({
  ...base,
  tags: ['brunch'],
  imagePublicId: `recipes/${overrides.slug}`,
  ...overrides,
})

// Whole, fraction, grams, a word unit that flips between singular and plural,
// and a line with no quantity.
const pancakes = recipe({
  _id: '65d000000000000000000001',
  name: 'E2E Scaling Pancakes',
  slug: 'e2e-scaling-pancakes',
  servings: 4,
  ingredients: [
    { quantity: 2, unit: 'cups', item: 'flour' },
    { quantity: 0.5, unit: 'tsp', item: 'salt' },
    { quantity: 250, unit: 'g', item: 'butter' },
    { quantity: 3, unit: null, item: 'eggs' },
    { quantity: null, unit: null, item: 'black pepper to taste' },
  ],
})

const LINES = {
  1: ['1/2 cup flour', '1/8 tsp salt', '63 g butter', '3/4 eggs', 'black pepper to taste'],
  2: ['1 cup flour', '1/4 tsp salt', '125 g butter', '1 1/2 eggs', 'black pepper to taste'],
  3: ['1 1/2 cups flour', '3/8 tsp salt', '188 g butter', '2 1/4 eggs', 'black pepper to taste'],
  4: ['2 cups flour', '1/2 tsp salt', '250 g butter', '3 eggs', 'black pepper to taste'],
  5: ['2 1/2 cups flour', '5/8 tsp salt', '313 g butter', '3 3/4 eggs', 'black pepper to taste'],
  6: ['3 cups flour', '3/4 tsp salt', '375 g butter', '4 1/2 eggs', 'black pepper to taste'],
}

// Under the 100-servings cap by one.
const crowdRice = recipe({
  _id: '65d000000000000000000002',
  name: 'E2E Crowd Rice',
  slug: 'e2e-crowd-rice',
  servings: 99,
  ingredients: [{ quantity: 99, unit: 'g', item: 'rice' }],
})

// Over the cap: its own servings are the most.
const banquetSugar = recipe({
  _id: '65d000000000000000000003',
  name: 'E2E Banquet Sugar',
  slug: 'e2e-banquet-sugar',
  servings: 120,
  ingredients: [{ quantity: 120, unit: 'g', item: 'sugar' }],
})

const ingredientsSection = (page: Page) => page.getByRole('region', { name: 'Ingredients', exact: true })
const stepper = (page: Page) => page.getByRole('group', { name: 'Servings', exact: true })
const decrease = (page: Page) => stepper(page).getByRole('button', { name: 'Decrease servings', exact: true })
const increase = (page: Page) => stepper(page).getByRole('button', { name: 'Increase servings', exact: true })
const reset = (page: Page) => page.getByRole('button', { name: 'Reset servings', exact: true })
const servingsStatus = (page: Page) => ingredientsSection(page).getByRole('status')

async function pressTimes(button: ReturnType<typeof increase>, times: number) {
  for (let i = 0; i < times; i++) await button.click()
}

test('the stepper starts at the recipe’s servings with today’s lines and no Reset', async ({ page }) => {
  await openRecipe(page, pancakes.slug)

  await expect(stepper(page)).toBeVisible()
  await expect(decrease(page)).toBeVisible()
  await expect(increase(page)).toBeVisible()
  await expect(servingsStatus(page)).toHaveText('for 4 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[4])
  await expect(reset(page)).toHaveCount(0)
})

test('each step button is described by the servings status', async ({ page }) => {
  await openRecipe(page, pancakes.slug)

  await expect(decrease(page)).toHaveAccessibleDescription('for 4 servings')
  await expect(increase(page)).toHaveAccessibleDescription('for 4 servings')
  await increase(page).click()
  await expect(increase(page)).toHaveAccessibleDescription('for 5 servings')
})

test('Increase adds one serving at a time, scaling the lines and the status text', async ({ page }) => {
  await openRecipe(page, pancakes.slug)

  await increase(page).click()
  await expect(servingsStatus(page)).toHaveText('for 5 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[5])

  await increase(page).click()
  await expect(servingsStatus(page)).toHaveText('for 6 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[6])
})

test('Decrease removes one serving at a time; a word unit turns singular at one', async ({ page }) => {
  await openRecipe(page, pancakes.slug)

  await decrease(page).click()
  await expect(servingsStatus(page)).toHaveText('for 3 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[3])

  await decrease(page).click()
  await expect(servingsStatus(page)).toHaveText('for 2 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[2])
})

test('the facts row keeps the recipe’s own servings while the stepper changes', async ({ page }) => {
  await openRecipe(page, pancakes.slug)

  await increase(page).click()
  await expect(servingsStatus(page)).toHaveText('for 5 servings')
  await expect(factValues(page).last()).toHaveText('4')
})

test('at 1 serving the status says "serving", Decrease is aria-disabled, pressing it changes nothing, and focus stays', async ({
  page,
}) => {
  await openRecipe(page, pancakes.slug)

  await pressTimes(decrease(page), 3)
  await expect(servingsStatus(page)).toHaveText('for 1 serving')
  await expect(ingredientItems(page)).toHaveText(LINES[1])
  await expect(decrease(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(decrease(page)).not.toHaveAttribute('disabled')
  await expect(increase(page)).not.toHaveAttribute('aria-disabled', 'true')
  await expect(decrease(page)).toBeFocused()

  // force: Playwright otherwise waits for an aria-disabled button to become enabled.
  await decrease(page).click({ force: true })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')

  await expect(servingsStatus(page)).toHaveText('for 1 serving')
  await expect(ingredientItems(page)).toHaveText(LINES[1])
  await expect(decrease(page)).toBeFocused()
})

test('servings stop at 100 for a recipe that serves fewer: Increase is aria-disabled there and focus stays', async ({
  page,
}) => {
  await openRecipe(page, crowdRice.slug)
  await expect(increase(page)).not.toHaveAttribute('aria-disabled', 'true')

  await increase(page).click()
  await expect(servingsStatus(page)).toHaveText('for 100 servings')
  await expect(ingredientItems(page)).toHaveText(['100 g rice'])
  await expect(increase(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(increase(page)).not.toHaveAttribute('disabled')
  await expect(increase(page)).toBeFocused()

  await increase(page).click({ force: true })
  await page.keyboard.press('Enter')

  await expect(servingsStatus(page)).toHaveText('for 100 servings')
  await expect(ingredientItems(page)).toHaveText(['100 g rice'])
  await expect(increase(page)).toBeFocused()
})

test('a recipe that serves more than 100 starts at its own servings, which is the most', async ({ page }) => {
  await openRecipe(page, banquetSugar.slug)

  await expect(servingsStatus(page)).toHaveText('for 120 servings')
  await expect(increase(page)).toHaveAttribute('aria-disabled', 'true')

  await increase(page).click({ force: true })
  await expect(servingsStatus(page)).toHaveText('for 120 servings')

  await decrease(page).click()
  await expect(servingsStatus(page)).toHaveText('for 119 servings')
  await expect(ingredientItems(page)).toHaveText(['119 g sugar'])
  await expect(increase(page)).not.toHaveAttribute('aria-disabled', 'true')
})

test.describe('Reset', () => {
  test('appears once the servings differ, and restores the recipe’s servings and lines', async ({ page }) => {
    await openRecipe(page, pancakes.slug)

    await increase(page).click()
    await increase(page).click()
    await expect(reset(page)).toBeVisible()

    await reset(page).click()

    await expect(servingsStatus(page)).toHaveText('for 4 servings')
    await expect(ingredientItems(page)).toHaveText(LINES[4])
    await expect(reset(page)).toHaveCount(0)
  })

  test('moves focus to Increase servings, since Reset itself disappears', async ({ page }) => {
    await openRecipe(page, pancakes.slug)

    await decrease(page).click()
    await reset(page).focus()
    await page.keyboard.press('Enter')

    await expect(servingsStatus(page)).toHaveText('for 4 servings')
    await expect(reset(page)).toHaveCount(0)
    await expect(increase(page)).toBeFocused()
  })

  test('disappears when the servings are stepped back to the recipe’s own', async ({ page }) => {
    await openRecipe(page, pancakes.slug)

    await increase(page).click()
    await expect(reset(page)).toBeVisible()
    await decrease(page).click()

    await expect(servingsStatus(page)).toHaveText('for 4 servings')
    await expect(reset(page)).toHaveCount(0)
  })
})

test('ticked ingredients stay ticked by position as the servings change and reset', async ({ page }) => {
  await openRecipe(page, pancakes.slug)
  const boxes = ingredientItems(page).getByRole('checkbox')

  await boxes.nth(2).check()
  await boxes.nth(3).check()

  await increase(page).click()
  await increase(page).click()
  await expect(ingredientItems(page)).toHaveText(LINES[6])
  await expect(boxes.nth(2)).toHaveAccessibleName('375 g butter')
  await expect(boxes.nth(2)).toBeChecked()
  await expect(boxes.nth(3)).toHaveAccessibleName('4 1/2 eggs')
  await expect(boxes.nth(3)).toBeChecked()
  for (const index of [0, 1, 4]) await expect(boxes.nth(index)).not.toBeChecked()

  await reset(page).click()
  await expect(ingredientItems(page)).toHaveText(LINES[4])
  await expect(boxes.nth(2)).toBeChecked()
  await expect(boxes.nth(3)).toBeChecked()
  for (const index of [0, 1, 4]) await expect(boxes.nth(index)).not.toBeChecked()
})

test('the chosen servings stay out of the URL, and a reload returns to the recipe’s servings', async ({ page }) => {
  await openRecipe(page, pancakes.slug)

  await increase(page).click()
  await expect(servingsStatus(page)).toHaveText('for 5 servings')
  await expect(page).toHaveURL(`/recipes/${pancakes.slug}`)

  await page.reload()

  await expect(servingsStatus(page)).toHaveText('for 4 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[4])
  await expect(reset(page)).toHaveCount(0)
})

// The skip link jumps past the header; the recipe's tag link comes next, then the
// Share and Cook mode buttons, then the stepper.
test('the stepper works from the keyboard: Tab reaches Decrease then Increase, Enter and Space press them', async ({
  page,
}) => {
  await openRecipe(page, pancakes.slug)

  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(tagLinks(page).first()).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Cook mode', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(decrease(page)).toBeFocused()

  await page.keyboard.press('Space')
  await expect(servingsStatus(page)).toHaveText('for 3 servings')
  await page.keyboard.press('Enter')
  await expect(servingsStatus(page)).toHaveText('for 2 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[2])

  await page.keyboard.press('Tab')
  await expect(increase(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(servingsStatus(page)).toHaveText('for 3 servings')
  await page.keyboard.press('Space')
  await expect(servingsStatus(page)).toHaveText('for 4 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[4])
})

test('on a phone, the stepper buttons are at least 44px targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openRecipe(page, pancakes.slug)

  for (const button of [decrease(page), increase(page)]) {
    const box = (await button.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('printing hides the stepper buttons and Reset, and keeps "for N servings" and the scaled lines', async ({ page }) => {
  await openRecipe(page, pancakes.slug)
  await increase(page).click()
  await increase(page).click()
  await expect(reset(page)).toBeVisible()

  await page.emulateMedia({ media: 'print' })

  await expect(decrease(page)).toBeHidden()
  await expect(increase(page)).toBeHidden()
  await expect(reset(page)).toBeHidden()
  await expect(servingsStatus(page)).toBeVisible()
  await expect(servingsStatus(page)).toHaveText('for 6 servings')
  await expect(ingredientItems(page)).toHaveText(LINES[6])
  await expect(ingredientItems(page).first()).toBeVisible()
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the server HTML has the recipe’s own lines and "for N servings"', async ({ page }) => {
    await page.goto(`/recipes/${pancakes.slug}`)

    await expect(ingredientItems(page)).toHaveText(LINES[4])
    await expect(ingredientsSection(page).getByText('for 4 servings', { exact: true })).toBeVisible()
  })
})
