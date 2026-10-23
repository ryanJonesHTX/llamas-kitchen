import type { Request } from '@playwright/test'

// The fake cloud name tests/e2e/server.ts gives `next start`.
export const E2E_CLOUD_NAME = 'e2e-cloud'
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${E2E_CLOUD_NAME}/image/upload`

// Parses the multipart body the browser sent to Cloudinary.
export async function uploadFields(request: Request): Promise<FormData> {
  const body = request.postDataBuffer()
  if (!body) throw new Error('Upload request has no body')
  const contentType = await request.headerValue('content-type')
  if (!contentType) throw new Error('Upload request has no content-type')
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': contentType },
  }).formData()
}
