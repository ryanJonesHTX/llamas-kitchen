import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_BYTES } from '../../lib/uploads'

// uploadRecipeImage receives the image as a server-action body, which Next
// caps at 1 MB unless next.config.js raises it. Parsed with the same `bytes`
// package Next uses, so '2.5mb' means here what it means to Next.
const require = createRequire(import.meta.url)
const bytes: { parse(value: string | number): number | null } = require('next/dist/compiled/bytes')
// The matcher /_next/image applies to images.remotePatterns.
const { hasRemoteMatch }: { hasRemoteMatch(domains: string[], patterns: unknown[], url: URL): boolean } = require(
  'next/dist/shared/lib/match-remote-pattern'
)

const CONFIG_PATH = require.resolve('../../next.config.js')

// Evaluates next.config.js afresh, as Next does at build and start.
function loadConfig(cloudName: string | undefined) {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', cloudName)
  delete require.cache[CONFIG_PATH]
  return require(CONFIG_PATH)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

const nextConfig = loadConfig('test-cloud')
vi.unstubAllEnvs()

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

describe('next.config.js images.remotePatterns', () => {
  const allowed = (url: string) => hasRemoteMatch([], nextConfig.images.remotePatterns, new URL(url))

  it("allows uploads in the app's own Cloudinary cloud", () => {
    expect(allowed('https://res.cloudinary.com/test-cloud/image/upload/c_limit,w_1400,f_auto,q_auto/recipes/stew')).toBe(true)
  })

  it.each([
    ['another cloud', 'https://res.cloudinary.com/other-cloud/image/upload/x.jpg'],
    ['a cloud whose name starts with ours', 'https://res.cloudinary.com/test-cloud-2/image/upload/x.jpg'],
    ['a fetch delivery', 'https://res.cloudinary.com/test-cloud/image/fetch/https://example.com/x.jpg'],
    ['plain http', 'http://res.cloudinary.com/test-cloud/image/upload/x.jpg'],
    ['another host', 'https://example.com/test-cloud/image/upload/x.jpg'],
  ])('rejects %s', (_label, url) => {
    expect(allowed(url)).toBe(false)
  })

  it.each([[undefined], ['']])('throws when CLOUDINARY_CLOUD_NAME is %j', (cloudName) => {
    expect(() => loadConfig(cloudName)).toThrow('CLOUDINARY_CLOUD_NAME is not set')
  })
})
