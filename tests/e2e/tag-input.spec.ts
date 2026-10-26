import type { Page } from '@playwright/test'
import { MAX_RECIPE_TAG_LENGTH, MAX_RECIPE_TAGS } from '../../lib/constants.ts'
import { expect, test } from './test.ts'
import { signInAs } from './auth.ts'
import { disconnect, findRecipe, reseed } from './db.ts'
import { pendingRecipe, seedRecipe } from './fixtures.ts'
import {
  addTags,
  fillNewRecipe,
  formField,
  newRecipe,
  removeTagButton,
  saveButton,
  tagChips,
  tagInput,
} from './recipeForm.ts'
import { tagItems } from './recipePage.ts'

// The recipe form's tag input (components/TagInput.tsx): chips, a combobox of
// published tags in use, and a live region announcing each change.

test.beforeEach(async ({ context }) => {
  await reseed()
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
})

test.afterAll(async () => {
  await disconnect()
})

const stew = seedRecipe('E2E Beef Stew')

const announced = (page: Page, text: string) =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeAttached()

const options = (page: Page) => page.getByRole('listbox').getByRole('option')

// Fires a paste of `text` at the tag input, as the clipboard would.
async function pasteTags(page: Page, text: string) {
  await tagInput(page).evaluate((input, pasted) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', pasted)
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, text)
}

test('a tag is added by Enter, by a typed comma, by a paste of several and by leaving the field', async ({ page }) => {
  await page.goto('/new')

  await tagInput(page).fill('Weeknight')
  await tagInput(page).press('Enter')
  await expect(tagChips(page)).toHaveText(['weeknight'])
  await expect(tagInput(page)).toHaveValue('')
  await announced(page, 'Added tag weeknight.')

  await tagInput(page).pressSequentially(' Spicy,')
  await expect(tagChips(page)).toHaveText(['weeknight', 'spicy'])
  await expect(tagInput(page)).toHaveValue('')

  await pasteTags(page, 'Soup, Stew , ,Winter')
  await expect(tagChips(page)).toHaveText(['weeknight', 'spicy', 'soup', 'stew', 'winter'])
  await announced(page, 'Added tags soup, stew, winter.')

  // Tab picks the highlighted option, which is the typed text, then leaves.
  await tagInput(page).fill('Leftovers')
  await tagInput(page).press('Tab')
  await expect(tagInput(page)).not.toBeFocused()
  await expect(tagChips(page)).toHaveText(['weeknight', 'spicy', 'soup', 'stew', 'winter', 'leftovers'])

  await tagInput(page).fill('Freezer')
  await formField(page, 'Description').click()
  await expect(tagChips(page)).toHaveText(['weeknight', 'spicy', 'soup', 'stew', 'winter', 'leftovers', 'freezer'])
  await expect(tagInput(page)).toHaveValue('')
})

test('Enter in the tag input never submits the form', async ({ page }) => {
  await page.goto('/new')

  await tagInput(page).press('Enter')
  await tagInput(page).fill('quick')
  await tagInput(page).press('Escape')
  await tagInput(page).press('Enter')

  await expect(tagChips(page)).toHaveText(['quick'])
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
  await expect(page).toHaveURL('/new')
})

test('a suggestion is picked by click or by arrowing to it and pressing Enter', async ({ page }) => {
  await page.goto('/new')

  await tagInput(page).fill('chi')
  await expect(options(page)).toHaveText(['Add “chi”', 'chicken'])
  await options(page).filter({ hasText: /^chicken$/ }).click()
  await expect(tagChips(page)).toHaveText(['chicken'])
  await expect(tagInput(page)).toBeFocused()
  await expect(tagInput(page)).toHaveValue('')

  await tagInput(page).fill('B')
  await expect(options(page)).toHaveText(['Add “b”', 'beef'])
  await tagInput(page).press('ArrowDown')
  await tagInput(page).press('Enter')
  await expect(tagChips(page)).toHaveText(['chicken', 'beef'])
  await announced(page, 'Added tag beef.')
})

test('an existing tag typed in full is the first option, and Enter adds it', async ({ page }) => {
  await page.goto('/new')

  await tagInput(page).fill('Beef')
  await expect(options(page)).toHaveText(['beef'])
  await tagInput(page).press('Enter')
  await expect(tagChips(page)).toHaveText(['beef'])
})

test('with nothing typed, ArrowDown lists the published tags not yet chosen', async ({ page }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)

  await tagInput(page).press('ArrowDown')
  await expect(options(page)).toHaveText(['chicken', 'curry', 'pork'])
})

test('suggestions never include a tag only a pending recipe has', async ({ page }) => {
  expect(pendingRecipe.tags).toContain('pie')
  await page.goto('/new')

  await tagInput(page).fill('p')
  await expect(options(page)).toHaveText(['Add “p”', 'pork'])
  await tagInput(page).fill('pi')
  await expect(options(page)).toHaveText(['Add “pi”'])
  await tagInput(page).fill('')
  await tagInput(page).press('ArrowDown')
  await expect(options(page)).toHaveText(['beef', 'chicken', 'curry', 'pork', 'stew'])
})

test('a chip is removed by its button or by Backspace in the empty input, and focus returns to the input', async ({
  page,
}) => {
  await page.goto('/new')
  await addTags(page, ['soup', 'stew', 'winter'])

  await removeTagButton(page, 'stew').click()
  await expect(tagChips(page)).toHaveText(['soup', 'winter'])
  await expect(tagInput(page)).toBeFocused()
  await announced(page, 'Removed tag stew.')

  await tagInput(page).press('Backspace')
  await expect(tagChips(page)).toHaveText(['soup'])
  await announced(page, 'Removed tag winter.')

  // Backspace with text only edits the text.
  await tagInput(page).fill('ab')
  await tagInput(page).press('Backspace')
  await expect(tagInput(page)).toHaveValue('a')
  await expect(tagChips(page)).toHaveText(['soup'])
})

test('a tag already chosen is not added again, and that is announced', async ({ page }) => {
  await page.goto('/new')
  await addTags(page, ['beef'])

  await tagInput(page).fill(' BEEF ')
  await expect(options(page)).toHaveCount(0)
  await tagInput(page).press('Enter')
  await expect(tagChips(page)).toHaveText(['beef'])
  await announced(page, 'Tag beef is already added.')
})

test(`at ${MAX_RECIPE_TAGS} tags the input takes no more until one is removed`, async ({ page }) => {
  const tags = Array.from({ length: MAX_RECIPE_TAGS }, (_, i) => `tag ${i + 1}`)
  await page.goto('/new')
  await expect(tagInput(page)).toHaveAccessibleDescription(`Press Enter or type a comma after each tag. 0 of ${MAX_RECIPE_TAGS} tags.`)
  await expect(tagInput(page)).toHaveAttribute('maxlength', String(MAX_RECIPE_TAG_LENGTH))

  await pasteTags(page, [...tags, 'one too many'].join(','))
  await expect(tagChips(page)).toHaveText(tags)
  await announced(page, `A recipe can have at most ${MAX_RECIPE_TAGS} tags.`)
  await expect(tagInput(page)).toHaveAccessibleDescription(
    `${MAX_RECIPE_TAGS} of ${MAX_RECIPE_TAGS} tags. Remove a tag to add another.`
  )
  await expect(tagInput(page)).not.toBeEditable()

  await removeTagButton(page, 'tag 1').click()
  await expect(tagInput(page)).toBeEditable()
  await expect(tagInput(page)).toHaveAccessibleDescription(
    `Press Enter or type a comma after each tag. ${MAX_RECIPE_TAGS - 1} of ${MAX_RECIPE_TAGS} tags.`
  )
})

test('the saved recipe has its tags in the order they were added, text left in the input included', async ({
  page,
}) => {
  await page.goto('/new')
  await fillNewRecipe(page)
  await tagInput(page).fill('chi')
  await options(page).filter({ hasText: /^chicken$/ }).click()
  await tagInput(page).fill('Weeknight')
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${newRecipe.slug}`)
  await expect(tagItems(page)).toHaveText(['pasta', 'bake', 'chicken', 'weeknight'])
  expect((await findRecipe({ slug: newRecipe.slug }))?.tags).toEqual(['pasta', 'bake', 'chicken', 'weeknight'])
})

test("the edit form shows the recipe's tags as chips and saves changes to them", async ({ page }) => {
  await page.goto(`/recipes/${stew.slug}/edit`)
  await expect(tagChips(page)).toHaveText(stew.tags)

  await removeTagButton(page, 'stew').click()
  await addTags(page, ['Hearty'])
  await saveButton(page).click()

  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  expect((await findRecipe({ _id: stew._id }))?.tags).toEqual(['beef', 'hearty'])
})

// Typing stops at the length limit; a paste with commas could carry a longer tag.
test('an over-long tag in a paste is refused and announced, and the rest of the paste is added', async ({ page }) => {
  const longTag = 'x'.repeat(MAX_RECIPE_TAG_LENGTH + 1)
  await page.goto(`/recipes/${stew.slug}/edit`)

  await pasteTags(page, `${longTag}, hearty`)
  await expect(tagChips(page)).toHaveText([...stew.tags, 'hearty'])
  await announced(page, `Added tag hearty. Tags can be at most ${MAX_RECIPE_TAG_LENGTH} characters.`)

  await saveButton(page).click()
  await expect(page).toHaveURL(`/recipes/${stew.slug}`)
  expect((await findRecipe({ _id: stew._id }))?.tags).toEqual([...stew.tags, 'hearty'])
})
