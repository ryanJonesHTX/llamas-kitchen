import type { Locator, Page } from '@playwright/test'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'
import { seedRecipe } from './fixtures.ts'
import { ingredientItems, openRecipe, stepsList, stepTexts, tagLinks } from './recipePage.ts'
import { fakeWakeLock, hideTab, showTab, wakeLockLog } from './wakeLock.ts'

// Cook mode on the recipe page: a toggle in the actions row that keeps the
// screen awake (Screen Wake Lock API, faked by wakeLock.ts) and trims the page
// down to what's needed at the stove, with bigger text.

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')
const SLEEP_NOTE = 'Your screen may still go to sleep.'

const cookMode = (page: Page) => page.getByRole('button', { name: 'Cook mode', exact: true })
const editLink = (page: Page) => page.getByRole('link', { name: 'Edit', exact: true })
const heroImage = (page: Page) => page.getByRole('img', { name: stew.name, exact: true })
const sleepNote = (page: Page) => page.getByText(SLEEP_NOTE, { exact: true })
const firstIngredientLine = (page: Page) => ingredientItems(page).first().getByText('2 lb stewing beef', { exact: true })
const increaseServings = (page: Page) => page.getByRole('button', { name: 'Increase servings', exact: true })
const servingsStatus = (page: Page) =>
  page.getByRole('region', { name: 'Ingredients', exact: true }).getByRole('status')

const fontSize = (locator: Locator) =>
  locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))

// Waits until the Cook mode button is hydrated, so a press is never lost.
async function waitForCookMode(page: Page) {
  await expect(cookMode(page)).toBeVisible()
  await expect
    .poll(() => cookMode(page).evaluate((button) => Object.keys(button).some((key) => key.startsWith('__reactProps$'))))
    .toBe(true)
}

// Opens the stew and waits until both the servings stepper and the Cook mode
// button are hydrated.
async function openForCooking(page: Page) {
  await openRecipe(page, stew.slug)
  await waitForCookMode(page)
}

async function turnOn(page: Page) {
  await cookMode(page).click()
  await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'true')
}

test.describe('the Cook mode button', () => {
  test('is shown to a signed-out visitor, off, with no Edit link beside it', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)

    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(editLink(page)).toHaveCount(0)
  })

  test('is shown to an editor next to Edit', async ({ context, page }) => {
    await signInAs(context, { email: 'admin@example.com', role: 'admin' })
    await fakeWakeLock(page)
    await openForCooking(page)

    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(editLink(page)).toBeVisible()
  })

  test('is at least 44px tall on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await fakeWakeLock(page)
    await openForCooking(page)

    const box = (await cookMode(page).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  test('pressing it turns cook mode on and requests a screen wake lock', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    expect((await wakeLockLog(page)).requests).toEqual([])

    await turnOn(page)

    await expect.poll(async () => (await wakeLockLog(page)).requests).toEqual(['screen'])
    await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)
  })

  test('pressing it again turns cook mode off and releases the wake lock', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)
    await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)

    await cookMode(page).click()

    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => wakeLockLog(page)).toEqual({ requests: ['screen'], releases: 1, held: 0 })
  })

  test('cook mode starts off again after a reload', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)

    await page.reload()

    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(heroImage(page)).toBeVisible()
    expect((await wakeLockLog(page)).requests).toEqual([])
  })
})

test.describe('while cook mode is on', () => {
  test('the hero image and the tags are hidden', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await expect(heroImage(page)).toBeVisible()
    await expect(tagLinks(page).first()).toBeVisible()

    await turnOn(page)

    await expect(heroImage(page)).toBeHidden()
    for (const tag of await tagLinks(page).all()) await expect(tag).toBeHidden()
  })

  test('the description, ingredients, steps and notes stay visible', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)

    await turnOn(page)

    await expect(page.getByText(stew.description, { exact: true })).toBeVisible()
    await expect(ingredientItems(page)).toHaveCount(stew.ingredients.length)
    for (const item of await ingredientItems(page).all()) await expect(item).toBeVisible()
    await expect(stepTexts(page)).toHaveText(stew.steps)
    for (const step of await stepTexts(page).all()) await expect(step).toBeVisible()
    await expect(page.getByText(stew.notes!, { exact: true })).toBeVisible()
  })

  test('step text and ingredient lines are bigger, and back to normal once it is off', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    const stepBefore = await fontSize(stepTexts(page).first())
    const ingredientBefore = await fontSize(firstIngredientLine(page))

    await turnOn(page)

    await expect.poll(() => fontSize(stepTexts(page).first())).toBeGreaterThan(stepBefore)
    await expect.poll(() => fontSize(firstIngredientLine(page))).toBeGreaterThan(ingredientBefore)

    await cookMode(page).click()

    await expect.poll(() => fontSize(stepTexts(page).first())).toBe(stepBefore)
    await expect.poll(() => fontSize(firstIngredientLine(page))).toBe(ingredientBefore)
  })

  test('the servings stepper still works, and the chosen servings survive turning it on and off', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await increaseServings(page).click()
    await expect(servingsStatus(page)).toHaveText('for 7 servings')

    await turnOn(page)
    await expect(servingsStatus(page)).toHaveText('for 7 servings')
    await increaseServings(page).click()
    await expect(servingsStatus(page)).toHaveText('for 8 servings')

    await cookMode(page).click()
    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(servingsStatus(page)).toHaveText('for 8 servings')
  })
})

test.describe('the screen-sleep note', () => {
  test('shows while on in a browser without the wake lock API', async ({ page }) => {
    await fakeWakeLock(page, 'absent')
    await openForCooking(page)
    await expect(sleepNote(page)).toHaveCount(0)

    await turnOn(page)

    await expect(sleepNote(page)).toBeVisible()
  })

  test('shows while on when the browser refuses the wake lock', async ({ page }) => {
    await fakeWakeLock(page, 'reject')
    await openForCooking(page)

    await turnOn(page)

    await expect.poll(async () => (await wakeLockLog(page)).requests).toEqual(['screen'])
    await expect(sleepNote(page)).toBeVisible()
  })

  test('is absent while the wake lock is held', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)

    await turnOn(page)

    await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)
    await expect(sleepNote(page)).toHaveCount(0)
  })

  test('never appears while a request that succeeds is still in flight', async ({ page }) => {
    await fakeWakeLock(page, 'slow')
    await openForCooking(page)
    // Flags the note the moment it's added anywhere on the page.
    await page.evaluate((note) => {
      const win = window as unknown as { __sawNote: boolean }
      win.__sawNote = false
      new MutationObserver(() => {
        if (document.body.textContent?.includes(note)) win.__sawNote = true
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    }, SLEEP_NOTE)

    await turnOn(page)

    await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)
    expect(await page.evaluate(() => (window as unknown as { __sawNote: boolean }).__sawNote)).toBe(false)
    await expect(sleepNote(page)).toHaveCount(0)
  })

  test('goes away when cook mode is turned off', async ({ page }) => {
    await fakeWakeLock(page, 'absent')
    await openForCooking(page)
    await turnOn(page)
    await expect(sleepNote(page)).toBeVisible()

    await cookMode(page).click()

    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(sleepNote(page)).toHaveCount(0)
  })
})

test('when the tab is hidden and shown again, the wake lock is requested again', async ({ page }) => {
  await fakeWakeLock(page)
  await openForCooking(page)
  await turnOn(page)
  await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)

  await hideTab(page)

  // The browser dropped the lock: the note says so until it's back.
  await expect(sleepNote(page)).toBeVisible()
  expect((await wakeLockLog(page)).requests).toEqual(['screen'])

  await showTab(page)

  await expect.poll(async () => (await wakeLockLog(page)).requests).toEqual(['screen', 'screen'])
  await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)
  await expect(sleepNote(page)).toHaveCount(0)
  await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'true')
})

test('leaving the page by a client-side link releases the wake lock', async ({ page }) => {
  await fakeWakeLock(page)
  await openForCooking(page)
  await turnOn(page)
  await expect.poll(async () => (await wakeLockLog(page)).held).toBe(1)

  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Recipes', exact: true }).click()
  await expect(page).toHaveURL('/recipes')

  // The log lives on window, so it survives only a client-side navigation.
  await expect.poll(() => wakeLockLog(page)).toEqual({ requests: ['screen'], releases: 1, held: 0 })
})

test('printing ignores cook mode: step text prints at the same size on or off', async ({ page }) => {
  await fakeWakeLock(page)
  await openForCooking(page)
  await page.emulateMedia({ media: 'print' })
  const printedOff = await fontSize(stepTexts(page).first())
  await page.emulateMedia({ media: 'screen' })

  await turnOn(page)
  await page.emulateMedia({ media: 'print' })

  expect(await fontSize(stepTexts(page).first())).toBe(printedOff)
})

// In cook mode each step becomes a checklist row: a checkbox named "Step N",
// described by the step's text, ticked by clicking anywhere on the row.
test.describe('the steps checklist', () => {
  const stepBoxes = (page: Page) => stepsList(page).getByRole('checkbox')
  const stepBox = (page: Page, number: number) => page.getByRole('checkbox', { name: `Step ${number}`, exact: true })
  const ingredientBox = (page: Page) => page.getByRole('checkbox', { name: '2 lb stewing beef', exact: true })

  const decorationLine = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).textDecorationLine)

  async function expectStruck(page: Page, index: number) {
    await expect.poll(() => decorationLine(stepTexts(page).nth(index))).toContain('line-through')
  }

  async function expectNotStruck(page: Page, index: number) {
    await expect.poll(() => decorationLine(stepTexts(page).nth(index))).not.toContain('line-through')
  }

  test('with cook mode off, steps are plain text: no checkboxes and no strike-through', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)

    await expect(stepBoxes(page)).toHaveCount(0)
    await expect(stepTexts(page)).toHaveText(stew.steps)
    for (const index of stew.steps.keys()) await expectNotStruck(page, index)
  })

  test('with cook mode on, there is one checkbox per step, named "Step N" and described by its text', async ({
    page,
  }) => {
    await fakeWakeLock(page)
    await openForCooking(page)

    await turnOn(page)

    await expect(stepBoxes(page)).toHaveCount(stew.steps.length)
    for (const [index, text] of stew.steps.entries()) {
      const box = stepBox(page, index + 1)
      await expect(box).toBeVisible()
      await expect(box).not.toBeChecked()
      await expect(box).toHaveAccessibleDescription(text)
    }
    await expect(stepTexts(page)).toHaveText(stew.steps)
  })

  test("clicking a step's text ticks it and crosses it out; clicking again unticks it", async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)

    await stepTexts(page).first().click()

    await expect(stepBox(page, 1)).toBeChecked()
    await expect(stepBox(page, 2)).not.toBeChecked()
    await expectStruck(page, 0)
    await expectNotStruck(page, 1)

    await stepTexts(page).first().click()

    await expect(stepBox(page, 1)).not.toBeChecked()
    await expectNotStruck(page, 0)
  })

  test('Tab reaches the step checkboxes in order after the ingredients, and Space toggles one', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)

    await ingredientItems(page).getByRole('checkbox').last().focus()
    await page.keyboard.press('Tab')
    await expect(stepBox(page, 1)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(stepBox(page, 2)).toBeFocused()

    await page.keyboard.press('Space')
    await expect(stepBox(page, 2)).toBeChecked()
    await expectStruck(page, 1)
    await page.keyboard.press('Space')
    await expect(stepBox(page, 2)).not.toBeChecked()
  })

  test('ticks survive turning cook mode off and on again, and are hidden while it is off', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)
    await stepBox(page, 2).check()

    await cookMode(page).click()
    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(stepBoxes(page)).toHaveCount(0)
    await expect(stepTexts(page)).toHaveText(stew.steps)
    for (const index of stew.steps.keys()) await expectNotStruck(page, index)

    await turnOn(page)
    await expect(stepBox(page, 1)).not.toBeChecked()
    await expect(stepBox(page, 2)).toBeChecked()
    await expectStruck(page, 1)
  })

  test('ticks survive changing the servings', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)
    await stepBox(page, 1).check()

    await increaseServings(page).click()
    await expect(servingsStatus(page)).toHaveText('for 7 servings')

    await expect(stepBox(page, 1)).toBeChecked()
    await expect(stepBox(page, 2)).not.toBeChecked()
    await expectStruck(page, 0)
  })

  test('ingredient ticks and step ticks are independent', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)

    await stepBox(page, 1).check()
    for (const box of await ingredientItems(page).getByRole('checkbox').all()) await expect(box).not.toBeChecked()

    await ingredientBox(page).check()
    await expect(stepBox(page, 1)).toBeChecked()
    await expect(stepBox(page, 2)).not.toBeChecked()

    await stepBox(page, 1).uncheck()
    await expect(ingredientBox(page)).toBeChecked()
  })

  test('a reload turns cook mode off and clears every step tick', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)
    await stepBox(page, 1).check()
    await stepBox(page, 2).check()

    await page.reload()
    await waitForCookMode(page)

    await expect(cookMode(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(stepBoxes(page)).toHaveCount(0)

    await turnOn(page)
    await expect(stepBox(page, 1)).not.toBeChecked()
    await expect(stepBox(page, 2)).not.toBeChecked()
    for (const index of stew.steps.keys()) await expectNotStruck(page, index)
  })

  test('printing hides the step checkboxes and does not cross out a ticked step', async ({ page }) => {
    await fakeWakeLock(page)
    await openForCooking(page)
    await turnOn(page)
    await stepBox(page, 1).check()
    await expectStruck(page, 0)

    await page.emulateMedia({ media: 'print' })

    // getByRole skips display:none elements, so count the hidden boxes explicitly.
    const hiddenBoxes = stepsList(page).getByRole('checkbox', { includeHidden: true })
    await expect(hiddenBoxes).toHaveCount(stew.steps.length)
    for (const box of await hiddenBoxes.all()) await expect(box).toBeHidden()
    await expect(stepTexts(page)).toHaveText(stew.steps)
    await expect(stepTexts(page).first()).toBeVisible()
    await expectNotStruck(page, 0)
  })
})
