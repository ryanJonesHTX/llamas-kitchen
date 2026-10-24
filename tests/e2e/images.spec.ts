import { expect, test } from './test.ts'

// /_next/image fetches remote images only from the app's own Cloudinary cloud
// (next.config.js), so nobody can use the server to fetch and resize another
// account's images. `request` bypasses the browser routes in test.ts, so these
// reach the real optimizer.

const optimized = (url: string) => `/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`

test('refuses an image from another Cloudinary cloud', async ({ request }) => {
  const response = await request.get(optimized('https://res.cloudinary.com/other-cloud/image/upload/x.jpg'))

  expect(response.status()).toBe(400)
  expect(await response.text()).toBe('"url" parameter is not allowed')
})

test('serves the home page hero from the app itself', async ({ request }) => {
  const response = await request.get(optimized('/images/llama.webp'))

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^image\//)
})
