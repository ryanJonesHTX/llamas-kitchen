import { test as base } from '@playwright/test'
import { VALID_PNG } from './uploads.ts'

export { expect } from '@playwright/test'

const CLOUDINARY_IMAGES = 'https://res.cloudinary.com/'

// Recipe photos live on res.cloudinary.com. The browser asks for
// them directly (<img>) or through Next's optimizer (/_next/image?url=...),
// which would make the server download them. Both are answered here with a
// 1x1 PNG, so no test reaches the internet for an image.
function isCloudinaryImage(url: URL): boolean {
  if (url.href.startsWith(CLOUDINARY_IMAGES)) return true
  return url.pathname === '/_next/image' && (url.searchParams.get('url') ?? '').startsWith(CLOUDINARY_IMAGES)
}

// Every spec imports test from here instead of @playwright/test.
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.route(isCloudinaryImage, (route) =>
      route.fulfill({ contentType: 'image/png', body: VALID_PNG })
    )
    await provide(context)
  },
})
