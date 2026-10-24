import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import type { FakeUpload } from './fake-cloudinary.ts'

// The fake cloud name tests/e2e/server.ts gives `next start`.
export const E2E_CLOUD_NAME = 'e2e-cloud'
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${E2E_CLOUD_NAME}/image/upload`

// Where tests/e2e/fake-cloudinary.ts records the uploads it answers. Shared by
// the server process and the test workers, so it lives in a fixed place.
export const FAKE_CLOUDINARY_LOG = join(tmpdir(), 'llamas-kitchen-e2e-cloudinary.jsonl')

// Every upload the fake has answered since the last reset, oldest first.
export function cloudinaryUploads(): FakeUpload[] {
  if (!existsSync(FAKE_CLOUDINARY_LOG)) return []
  return readFileSync(FAKE_CLOUDINARY_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FakeUpload)
}

// While this file is missing, the fake holds uploads of files named "*slow*".
export const SLOW_UPLOAD_RELEASE = `${FAKE_CLOUDINARY_LOG}.release`

export function releaseSlowUpload(): void {
  writeFileSync(SLOW_UPLOAD_RELEASE, '')
}

export function resetCloudinaryUploads(): void {
  rmSync(FAKE_CLOUDINARY_LOG, { force: true })
  rmSync(SLOW_UPLOAD_RELEASE, { force: true })
}

// A real 1x1 PNG, so it passes the server's magic-byte check.
export const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

// Uploads go browser -> server action -> Cloudinary, so the browser itself
// never calls Cloudinary. Aborts and records any request it does make.
export async function blockBrowserCloudinary(page: Page): Promise<string[]> {
  const urls: string[] = []
  await page.route('https://api.cloudinary.com/**', (route) => {
    urls.push(route.request().url())
    return route.abort()
  })
  return urls
}
