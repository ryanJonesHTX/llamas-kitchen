import AxeBuilder from '@axe-core/playwright'
import type { BrowserContext, Page } from '@playwright/test'
import { RECIPE_PAGE_SIZE } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { deleteAllRecipes, disconnect, insertRecipes, reseed } from './db.ts'
import { pendingRecipe, rejectedRecipe, SEED_SUBMITTER_ID, seedRecipe } from './fixtures.ts'
import { addTags, fillSteps, saveButton, stepField, tagInput } from './recipeForm.ts'
import { disableAutoLoad, pagingRecipes } from './paging.ts'
import { openRecipe } from './recipePage.ts'
import { fakeWakeLock } from './wakeLock.ts'

// axe-core over every page and state, in both themes. Serious and critical
// violations fail the test; the message lists each rule and its targets.
// Also the skip link, which axe can't operate.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const FAILING_IMPACTS = ['serious', 'critical']

const stew = seedRecipe('E2E Beef Stew')

const signInAsAdmin = (context: BrowserContext) =>
  signInAs(context, { email: 'admin@example.com', role: 'admin' }).then(() => undefined)

type Scenario = {
  name: string
  // Navigates and waits until the state under test is on screen.
  open: (page: Page, context: BrowserContext) => Promise<void>
}

const scenarios: Scenario[] = [
  {
    name: 'home',
    open: async (page) => {
      await page.goto('/')
    },
  },
  {
    name: 'recipe list',
    open: async (page) => {
      await page.goto('/recipes')
      await expect(page.getByRole('link', { name: stew.name })).toBeVisible()
    },
  },
  {
    name: 'recipe list with the filters open',
    open: async (page) => {
      await page.goto('/recipes')
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
      await expect(page.getByRole('group', { name: 'Tags' })).toBeVisible()
    },
  },
  {
    name: 'recipe list with no matches',
    open: async (page) => {
      // Pork Chops is the only pork recipe, and it is quick.
      await page.goto('/recipes?tag=pork&time=long')
      await expect(page.getByText('No recipes match these filters.')).toBeVisible()
    },
  },
  {
    name: 'recipe list with a search',
    open: async (page) => {
      await page.goto('/recipes?q=chicken')
      await expect(page.getByText('Results for “chicken”')).toBeVisible()
    },
  },
  {
    name: 'recipe list with a search that matches nothing',
    open: async (page) => {
      await page.goto('/recipes?q=zucchini')
      await expect(page.getByText('No recipes match this search.')).toBeVisible()
    },
  },
  {
    name: 'recipe list with a second page appended',
    open: async (page) => {
      await insertRecipes(pagingRecipes(RECIPE_PAGE_SIZE + 3))
      await disableAutoLoad(page)
      await page.goto('/recipes')
      await page.getByRole('button', { name: 'More recipes', exact: true }).click()
      await expect(page.getByText("That's every recipe.", { exact: true })).toBeVisible()
    },
  },
  {
    name: 'recipe list after a page failed to load',
    open: async (page) => {
      await insertRecipes(pagingRecipes(RECIPE_PAGE_SIZE + 3))
      await page.route('**/api/recipes**', (route) => route.fulfill({ status: 500, body: 'Internal Server Error' }))
      await disableAutoLoad(page)
      await page.goto('/recipes')
      await page.getByRole('button', { name: 'More recipes', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    },
  },
  {
    name: 'recipe page',
    open: async (page) => {
      await page.goto(`/recipes/${stew.slug}`)
    },
  },
  {
    name: 'recipe page with the servings changed and Reset showing',
    open: async (page) => {
      await openRecipe(page, stew.slug)
      await page.getByRole('button', { name: 'Increase servings', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Reset servings', exact: true })).toBeVisible()
    },
  },
  {
    name: 'recipe page in cook mode with the screen-sleep note',
    open: async (page) => {
      // Refused, so the note is on screen for axe to check too.
      await fakeWakeLock(page, 'reject')
      await openRecipe(page, stew.slug)
      const cookMode = page.getByRole('button', { name: 'Cook mode', exact: true })
      await expect(cookMode).toBeVisible()
      await expect
        .poll(() => cookMode.evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
        .toBe(true)
      await cookMode.click()
      await expect(cookMode).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText('Your screen may still go to sleep.', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'recipe page in cook mode with a step ticked',
    open: async (page) => {
      await fakeWakeLock(page)
      await openRecipe(page, stew.slug)
      const cookMode = page.getByRole('button', { name: 'Cook mode', exact: true })
      await expect(cookMode).toBeVisible()
      await expect
        .poll(() => cookMode.evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
        .toBe(true)
      await cookMode.click()
      await expect(cookMode).toHaveAttribute('aria-pressed', 'true')
      const firstStep = page.getByRole('checkbox', { name: 'Step 1', exact: true })
      await firstStep.check()
      await expect(firstStep).toBeChecked()
    },
  },
  {
    name: 'pending recipe page with its status banner',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto(`/recipes/${pendingRecipe.slug}`)
      await expect(page.getByText('Pending review', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'rejected recipe page with its status banner',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto(`/recipes/${rejectedRecipe.slug}`)
      await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'recipe page with the "Recipe saved" toast',
    open: async (page, context) => {
      await context.addCookies([{ name: 'flash', value: 'saved', url: 'http://127.0.0.1:3100' }])
      await page.goto(`/recipes/${stew.slug}`)
      await expect(page.getByRole('status').filter({ hasText: 'Recipe saved' })).toBeVisible()
    },
  },
  {
    name: 'new recipe form',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto('/new')
    },
  },
  {
    name: 'new recipe form after a failed submit',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto('/new')
      await saveButton(page).click()
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible()
    },
  },
  {
    name: 'new recipe form with three steps, one of them on two lines',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto('/new')
      await fillSteps(page, ['Boil the water.', 'Add the pasta.\nStir now and then.', 'Drain it.'])
      await expect(stepField(page, 3)).toHaveValue('Drain it.')
    },
  },
  {
    name: 'new recipe form with tag chips and the tag suggestions open',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto('/new')
      await addTags(page, ['beef', 'weeknight'])
      await tagInput(page).fill('c')
      await expect(page.getByRole('option', { name: 'chicken', exact: true })).toBeVisible()
    },
  },
  {
    name: 'edit form',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto(`/recipes/${stew.slug}/edit`)
    },
  },
  {
    name: "admin's edit form with the delete dialog open",
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto(`/recipes/${stew.slug}/edit`)
      const deleteButton = page.getByRole('button', { name: 'Delete recipe', exact: true })
      await expect(deleteButton).toBeVisible()
      await expect
        .poll(() => deleteButton.evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
        .toBe(true)
      await deleteButton.click()
      await expect(page.getByRole('dialog', { name: `Delete ${stew.name}?` })).toBeVisible()
    },
  },
  {
    name: "owner's edit form for a rejected recipe, with the rejection reason",
    open: async (page, context) => {
      await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })
      await page.goto(`/recipes/${rejectedRecipe.slug}/edit`)
      await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'review queue with the reject form open',
    open: async (page, context) => {
      await signInAsAdmin(context)
      await page.goto('/admin/queue')
      await page.getByRole('button', { name: `Reject ${pendingRecipe.name}` }).click()
      await expect(page.getByRole('textbox', { name: 'Reason for rejecting' })).toBeVisible()
    },
  },
  {
    name: 'review queue with nothing waiting',
    open: async (page, context) => {
      await deleteAllRecipes()
      await signInAsAdmin(context)
      await page.goto('/admin/queue')
      await expect(page.getByText('Nothing waiting for review.')).toBeVisible()
    },
  },
  {
    name: 'my recipes with published, pending and rejected items',
    open: async (page, context) => {
      // The submitter owns the seed's pending and rejected recipes; this adds a published one.
      await insertRecipes([
        {
          ...seedRecipe('E2E Pork Chops'),
          _id: '65a000000000000000000301',
          name: 'E2E Approved Pork Pie',
          slug: 'e2e-approved-pork-pie',
          submittedBy: SEED_SUBMITTER_ID,
        },
      ])
      await signInAs(context, { id: SEED_SUBMITTER_ID, email: 'submitter@example.com', role: 'user' })
      await page.goto('/my-recipes')
      await expect(page.getByText('Reason: Not a recipe.')).toBeVisible()
    },
  },
  {
    name: 'open user menu',
    open: async (page, context) => {
      await signInAs(context, { email: 'user@example.com', role: 'user' })
      await page.goto('/')
      await page.getByRole('button', { name: 'user@example.com', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    },
  },
  {
    name: 'open search dialog with results',
    open: async (page) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Search recipes', exact: true }).filter({ visible: true }).click()
      await page.getByRole('combobox', { name: 'Search recipes' }).fill('chic')
      await expect(page.getByRole('option', { name: 'See all results for “chic”' })).toBeVisible()
    },
  },
  {
    name: 'not-found page',
    open: async (page) => {
      await page.goto('/a/b/c')
    },
  },
  {
    name: 'open mobile menu',
    open: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/')
      await page.getByRole('button', { name: 'Open main menu' }).click()
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Close menu' })).toBeVisible()
    },
  },
]

type Violations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations']

// One line per rule, then one indented line per offending element.
const summary = (violations: Violations) =>
  violations
    .map(
      ({ id, impact, help, nodes }) =>
        `${id} (${impact}): ${help}\n${nodes.map((node) => `    ${node.target.join(' ')}`).join('\n')}`
    )
    .join('\n')

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    for (const { name, open } of scenarios) {
      test(`${name} has no serious or critical axe violations`, async ({ context, page }) => {
        await context.addCookies([{ name: 'theme', value: theme, url: 'http://127.0.0.1:3100' }])
        // Reduced motion: axe checks the settled state, not a toast or menu mid-fade.
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await open(page, context)
        // includeHidden: a modal opened from <main> hides the h1 from the accessibility tree.
        await expect(page.getByRole('heading', { level: 1, includeHidden: true })).toBeVisible()

        const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
        const failing = violations.filter((violation) => FAILING_IMPACTS.includes(violation.impact ?? ''))

        expect(failing, summary(failing)).toEqual([])
      })
    }
  })
}

test('the first Tab focuses a visible "Skip to content" link, and Enter moves focus to the main content', async ({
  page,
}) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to content', exact: true })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeInViewport()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await expect(skipLink).not.toBeInViewport()
})
