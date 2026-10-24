import { expect, test, type Page, type Request } from '@playwright/test'
import { MAX_UPLOAD_BYTES } from '../../lib/uploads.ts'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'

// Upload checks on the recipe form. Cloudinary is routed at the network
// boundary; no test ever reaches the real API.

test.beforeEach(async ({ context }) => {
  await reseed()
  await signInAs(context, { email: 'admin@example.com', role: 'admin' })
})

test.afterAll(async () => {
  await disconnect()
})

// Records every request to Cloudinary and answers it with `respond`.
async function routeCloudinary(
  page: Page,
  respond: Parameters<Page['route']>[1]
): Promise<Request[]> {
  const requests: Request[] = []
  await page.route('https://api.cloudinary.com/**', (route, request) => {
    requests.push(request)
    return respond(route, request)
  })
  return requests
}

// Upload errors are announced in an alert. Next.js has its own (empty)
// route-announcer alert, so match on text.
const uploadAlert = (page: Page, text: RegExp) =>
  page.getByRole('alert').filter({ hasText: text })

const uploadInput = (page: Page) => page.getByLabel('Upload an image')

test('a file over 2 MB is rejected with a message and never sent to Cloudinary', async ({
  page,
}) => {
  const requests = await routeCloudinary(page, (route) => route.abort())
  await page.goto('/new')

  await uploadInput(page).setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
  })

  await expect(uploadAlert(page, /\b2\s*MB/i)).toBeVisible()
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  expect(requests).toHaveLength(0)
})

test('a non-image file is rejected with a message and never sent to Cloudinary', async ({
  page,
}) => {
  const requests = await routeCloudinary(page, (route) => route.abort())
  await page.goto('/new')

  await uploadInput(page).setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  })

  await expect(uploadAlert(page, /image/i)).toBeVisible()
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  expect(requests).toHaveLength(0)
})

test('a Cloudinary error response shows an error and the image is not marked uploaded', async ({
  page,
}) => {
  const requests = await routeCloudinary(page, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { message: 'Invalid Signature' } },
    })
  )
  await page.goto('/new')

  await uploadInput(page).setInputFiles({
    name: 'lasagna.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a png'),
  })

  await expect(uploadAlert(page, /upload/i)).toBeVisible()
  expect(requests).toHaveLength(1)
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  await expect(uploadInput(page)).toBeAttached()
})

test('a network error reaching Cloudinary shows an error and the image is not marked uploaded', async ({
  page,
}) => {
  const requests = await routeCloudinary(page, (route) => route.abort('failed'))
  await page.goto('/new')

  await uploadInput(page).setInputFiles({
    name: 'lasagna.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a png'),
  })

  await expect(uploadAlert(page, /upload/i)).toBeVisible()
  expect(requests).toHaveLength(1)
  await expect(page.getByText('Image uploaded!')).toBeHidden()
  await expect(uploadInput(page)).toBeAttached()
})
