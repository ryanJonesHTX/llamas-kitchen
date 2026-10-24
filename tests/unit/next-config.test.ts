import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES } from '../../lib/uploads'

// uploadRecipeImage receives the image as a server-action body, which Next
// caps at 1 MB unless next.config.js raises it. Parsed with the same `bytes`
// package Next uses, so '2.5mb' means here what it means to Next.
const require = createRequire(import.meta.url)
const nextConfig = require('../../next.config.js')
const bytes: { parse(value: string | number): number | null } = require('next/dist/compiled/bytes')

// Room for the multipart boundaries, part headers and the action's other fields.
const MULTIPART_HEADROOM = 64 * 1024
// Prod Nginx is set to client_max_body_size 3m; Next must not accept more.
const NGINX_LIMIT = 3 * 1024 * 1024

describe('next.config.js serverActions.bodySizeLimit', () => {
  const limit = bytes.parse(nextConfig.experimental?.serverActions?.bodySizeLimit)

  it('lets a 2 MB image through with headroom for multipart overhead', () => {
    expect(limit).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES + MULTIPART_HEADROOM)
  })

  it('is no more than 3 MB', () => {
    expect(limit).toBeLessThanOrEqual(NGINX_LIMIT)
  })
})
