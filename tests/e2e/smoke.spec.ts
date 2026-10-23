import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { seedRecipes } from './fixtures.ts'

// Every test starts from exactly the seed fixtures, so no test depends on
// another (the add-recipe test creates data).
test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const recipe = (name: string) => {
  const found = seedRecipes.find((r) => r.name === name)
  if (!found) throw new Error(`No seed recipe named ${name}`)
  return found
}

// On the home page the recipe cards are the only level-3 headings.
const latestRecipeNames = (page: Page) =>
  page.getByRole('heading', { level: 3 })

// The recipe grid is a <section aria-labelledby="recipes-heading">.
const recipeGridNames = (page: Page) =>
  page
    .getByRole('region', { name: 'Recipes', exact: true })
    .getByRole('heading', { level: 3 })

const newestFirst = [
  'E2E Pork Chops',
  'E2E Chicken Curry',
  'E2E Beef Burgers',
  'E2E Chicken Tacos',
  'E2E Beef Stew',
]

test.describe('home page', () => {
  test('shows the heading and the four newest recipes, newest first', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: "Llama's Kitchen" })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Latest Recipes' })
    ).toBeVisible()
    await expect(latestRecipeNames(page)).toHaveText(newestFirst.slice(0, 4))
  })

  test('shows only seeded data from the in-memory database', async ({
    page,
  }) => {
    await page.goto('/')

    const names = await latestRecipeNames(page).allTextContents()
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toMatch(/^E2E /)
    }
  })
})

test.describe('recipe list', () => {
  test('shows every recipe, newest first by default', async ({ page }) => {
    await page.goto('/recipes')

    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })

  test('filters by category', async ({ page }) => {
    await page.goto('/recipes')

    await page.getByRole('button', { name: '0 Filters' }).click()
    await page.getByRole('checkbox', { name: 'Beef' }).check()

    await expect(recipeGridNames(page)).toHaveText([
      'E2E Beef Burgers',
      'E2E Beef Stew',
    ])
  })

  test('filters by total time', async ({ page }) => {
    await page.goto('/recipes')
    await page.getByRole('button', { name: '0 Filters' }).click()

    await page.getByRole('radio', { name: 'Total Time: > 1 Hour' }).check()
    await expect(recipeGridNames(page)).toHaveText([
      'E2E Chicken Curry',
      'E2E Beef Stew',
    ])

    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).check()
    await expect(recipeGridNames(page)).toHaveText([
      'E2E Pork Chops',
      'E2E Beef Burgers',
      'E2E Chicken Tacos',
    ])
  })

  test('"Clear all" restores the full list', async ({ page }) => {
    await page.goto('/recipes')
    await page.getByRole('button', { name: '0 Filters' }).click()
    await page.getByRole('checkbox', { name: 'Chicken' }).check()
    await page.getByRole('radio', { name: 'Total Time: ~1 Hour' }).check()
    await expect(recipeGridNames(page)).toHaveText(['E2E Chicken Tacos'])

    await page.getByRole('button', { name: 'Clear all' }).click()

    await expect(recipeGridNames(page)).toHaveText(newestFirst)
    await expect(page.getByRole('checkbox', { name: 'Chicken' })).not.toBeChecked()
  })

  test('sorts by oldest and newest', async ({ page }) => {
    await page.goto('/recipes')

    await page.getByRole('button', { name: 'Sort' }).click()
    await page.getByRole('menuitem', { name: 'Oldest' }).click()
    await expect(recipeGridNames(page)).toHaveText([...newestFirst].reverse())

    await page.getByRole('button', { name: 'Sort' }).click()
    await page.getByRole('menuitem', { name: 'Newest' }).click()
    await expect(recipeGridNames(page)).toHaveText(newestFirst)
  })
})

test('recipe page shows name, ingredients and directions', async ({ page }) => {
  const stew = recipe('E2E Beef Stew')

  await page.goto(`/${stew._id}`)

  await expect(
    page.getByRole('heading', { level: 1, name: stew.name })
  ).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveText(
    stew.ingredients.map((i) => i.ingredient)
  )
  await expect(page.getByText('Brown the beef.')).toBeVisible()
  await expect(page.getByText('Simmer for two hours.')).toBeVisible()
})

test('adding a recipe shows it on the home page and its own page', async ({
  context,
  page,
}) => {
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  const uploadedPhoto = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
  await page.route(
    'https://api.cloudinary.com/v1_1/*/image/upload/',
    (route) =>
      route.fulfill({
        json: { secure_url: uploadedPhoto, public_id: 'e2e-added-lasagna' },
      })
  )

  await page.goto('/new')
  // Two labels point at #name ("Recipe Name" and "Submitted By"), so match
  // the label text exactly.
  await page.getByLabel('Recipe Name', { exact: true }).fill('E2E Added Lasagna')
  await page.getByLabel('Description').fill('Layered pasta bake.')
  await page.getByLabel('Ingredients').fill('Lasagna sheets')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('listitem')).toContainText(['Lasagna sheets'])
  await page.getByLabel('Directions').fill('Layer and bake.')
  await page.getByLabel('Prep Time').fill('30')
  await page.getByLabel('Cook Time').fill('45')
  await page.getByLabel('Category').selectOption('Pasta')
  await page.getByLabel('Upload an image').setInputFiles({
    name: 'lasagna.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a png'),
  })
  await expect(page.getByText('Image uploaded!')).toBeVisible()

  await page.getByRole('button', { name: 'Submit' }).click()

  await page.waitForURL('/')
  await expect(latestRecipeNames(page).first()).toHaveText('E2E Added Lasagna')

  await page.getByRole('link', { name: 'E2E Added Lasagna' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'E2E Added Lasagna' })
  ).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveText(['Lasagna sheets'])
  await expect(page.getByText('Layer and bake.')).toBeVisible()
})
