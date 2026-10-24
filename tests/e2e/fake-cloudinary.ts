// Test-only Node preload for `next start` (loaded by tests/e2e/server.ts via
// NODE_OPTIONS=--import). It stands in for Cloudinary's upload API, which the
// uploadRecipeImage server action calls from the server, where Playwright
// can't route requests. Next captures globalThis.fetch as its "original"
// fetch when it patches it, so wrapping it before Next loads puts this fake
// underneath Next's fetch.
//
// Only POSTs to the e2e upload URL are answered here; every other fetch goes
// to the real fetch. Each answered upload is appended to the log file as one
// JSON line, so tests can read what was uploaded (see uploads.ts).
//
// A file whose name contains "slow" is held until the test calls
// releaseSlowUpload(), so a test can look at the form mid-upload.
import { appendFileSync, existsSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { CLOUDINARY_UPLOAD_URL, FAKE_CLOUDINARY_LOG, SLOW_UPLOAD_RELEASE } from './uploads.ts'

export type FakeUpload = {
  // Every string field of the multipart body.
  fields: Record<string, string>
  file: { name: string; type: string; size: number }
  publicId: string
}

const realFetch = globalThis.fetch

globalThis.fetch = async function fakeCloudinaryFetch(input, init) {
  const request = new Request(input, init)
  if (request.method !== 'POST' || request.url !== CLOUDINARY_UPLOAD_URL) {
    // The Request, not (input, init): building it took ownership of any body.
    return realFetch(request)
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new Error('fake Cloudinary: the upload has no file')
  const fields: Record<string, string> = {}
  for (const [name, value] of form) {
    if (typeof value === 'string') fields[name] = value
  }
  // Deterministic: "lasagna.png" uploads as "recipes/lasagna".
  const publicId = `recipes/${file.name.replace(/\.[^.]*$/, '')}`
  const upload: FakeUpload = {
    fields,
    file: { name: file.name, type: file.type, size: file.size },
    publicId,
  }
  // Bounded by the caller's abort signal (the action's upload timeout).
  while (file.name.includes('slow') && !existsSync(SLOW_UPLOAD_RELEASE)) {
    request.signal.throwIfAborted()
    await delay(50)
  }
  appendFileSync(FAKE_CLOUDINARY_LOG, `${JSON.stringify(upload)}\n`)
  return Response.json({ public_id: publicId })
}
