import { expect, test } from './test.ts'
import { MAX_UPLOAD_BYTES } from '../../lib/uploads.ts'
import { recordNextActions } from './actions.ts'
import { signInAs } from './auth.ts'
import { deleteSessions, disconnect, reseed } from './db.ts'
import { alertWith, imageInput, saveButton } from './recipeForm.ts'
import { blockBrowserCloudinary, cloudinaryUploads, releaseSlowUpload, VALID_PNG } from './uploads.ts'

// Upload rules on the recipe form. The form uploads through the
// uploadRecipeImage server action; the server's call to Cloudinary is
// answered by tests/e2e/fake-cloudinary.ts, never the real API.

let browserCloudinaryCalls: string[]

test.beforeEach(async ({ context, page }) => {
  await reseed()
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
  browserCloudinaryCalls = await blockBrowserCloudinary(page)
})

test.afterAll(async () => {
  await disconnect()
})

test('a file over 2 MB is rejected in the browser with the 2 MB message and never reaches the server', async ({
  page,
}) => {
  await page.goto('/new')
  const actions = recordNextActions(page)

  await imageInput(page).setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([VALID_PNG, Buffer.alloc(MAX_UPLOAD_BYTES)]),
  })

  await expect(alertWith(page, /\b2\s*MB/i)).toBeVisible()
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  expect(actions).toEqual([])
  expect(cloudinaryUploads()).toEqual([])
})

test('a non-image file named .png is rejected by the server with an error and nothing is uploaded', async ({
  page,
}) => {
  await page.goto('/new')
  const actions = recordNextActions(page)

  await imageInput(page).setInputFiles({
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a png'),
  })

  await expect(alertWith(page, /JPEG, PNG, WebP, AVIF or HEIC/)).toBeVisible()
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  // It got past the browser; the server's magic-byte check rejected it.
  expect(actions).toHaveLength(1)
  expect(cloudinaryUploads()).toEqual([])
  await expect(imageInput(page)).toBeAttached()
})

test('a valid PNG is uploaded to Cloudinary by the server with a signed request', async ({ page }) => {
  await page.goto('/new')

  await imageInput(page).setInputFiles({ name: 'lasagna.png', mimeType: 'image/png', buffer: VALID_PNG })

  await expect(page.getByText('Image uploaded!')).toBeVisible()
  const uploads = cloudinaryUploads()
  expect(uploads).toHaveLength(1)
  expect(uploads[0].file).toEqual({ name: 'lasagna.png', type: 'image/png', size: VALID_PNG.length })
  for (const name of ['signature', 'api_key', 'timestamp']) {
    expect(uploads[0].fields[name], name).toBeTruthy()
  }
  expect(uploads[0].fields).not.toHaveProperty('upload_preset')
  expect(browserCloudinaryCalls).toEqual([])
})

test('when the upload action throws (the session ended), an alert shows, nothing is uploaded and the file input is cleared', async ({
  page,
}) => {
  await page.goto('/new')
  await deleteSessions()

  await imageInput(page).setInputFiles({ name: 'lasagna.png', mimeType: 'image/png', buffer: VALID_PNG })

  await expect(alertWith(page, /Something went wrong/)).toBeVisible()
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  await expect(imageInput(page)).toHaveValue('')
  expect(cloudinaryUploads()).toEqual([])
})

// The fake Cloudinary holds "slow" uploads until releaseSlowUpload().
test('Save recipe is disabled while an image upload is in progress', async ({ page }) => {
  await page.goto('/new')
  await expect(saveButton(page)).toBeEnabled()

  await imageInput(page).setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: VALID_PNG })

  await expect(saveButton(page)).toBeDisabled()
  releaseSlowUpload()
  await expect(page.getByText('Image uploaded!')).toBeVisible()
  await expect(saveButton(page)).toBeEnabled()
})
