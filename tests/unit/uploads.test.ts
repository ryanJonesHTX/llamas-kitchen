import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signUploadParams } from '../../lib/uploadSignature'

// The signature endpoint reads the session through the repo-root auth.ts,
// which pulls in next-auth (not loadable under Vitest). Replace it at the
// module boundary, as tests/unit/recipes-api.test.ts does.
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('../../auth', () => ({ auth }))

const sessionFor = (role: 'user' | 'admin') => ({
  expires: '2999-01-01T00:00:00.000Z',
  user: { id: `${role}-id`, name: role, email: `${role}@example.com`, image: null, role },
})

type FakeRequest = { method: string; query: Record<string, string>; body?: unknown }

type FakeResponse = {
  statusCode: number | undefined
  body: any
  headers: Record<string, string>
  status(code: number): FakeResponse
  json(body: unknown): FakeResponse
  setHeader(name: string, value: string | string[]): FakeResponse
  end(): FakeResponse
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: undefined,
    body: undefined,
    headers: {},
    status(code) {
      res.statusCode = code
      return res
    },
    json(body) {
      res.body = JSON.parse(JSON.stringify(body))
      return res
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
      return res
    },
    end() {
      return res
    },
  }
  return res
}

type Handler = (req: FakeRequest, res: FakeResponse) => Promise<unknown>

async function loadHandler(): Promise<Handler> {
  return (await import('../../pages/api/uploads/signature.js')).default
}

async function call(handler: Handler, method: string) {
  const res = fakeResponse()
  await handler({ method, query: {} }, res)
  return res
}

describe('signUploadParams', () => {
  // Known vectors from Cloudinary's "Generating authentication signatures"
  // docs (https://cloudinary.com/documentation/authentication_signatures,
  // fetched 2026-10-23). Both vectors use SHA-1, the documented SDK default.
  it('matches the Cloudinary docs vector for a timestamp-only upload', () => {
    expect(signUploadParams({ timestamp: 1315060510 }, 'abcd')).toBe(
      'a21ad0f63beb4de2e5575204b79ab90bffb02c10',
    )
  })

  it('matches the Cloudinary docs vector with eager and public_id, sorting params by name', () => {
    expect(
      signUploadParams(
        {
          timestamp: 1315060510,
          public_id: 'sample_image',
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e')
  })

  it('ignores file, cloud_name, resource_type and api_key, which Cloudinary never signs', () => {
    const signed = { timestamp: 1315060510, public_id: 'sample_image' }
    const withExcluded = {
      ...signed,
      file: 'https://www.example.com/sample.jpg',
      cloud_name: 'demo',
      resource_type: 'image',
      api_key: '1234',
    }
    expect(signUploadParams(withExcluded, 'abcd')).toBe(signUploadParams(signed, 'abcd'))
  })

  it('changes when a signed param changes', () => {
    expect(signUploadParams({ timestamp: 1315060510, folder: 'recipes' }, 'abcd')).not.toBe(
      signUploadParams({ timestamp: 1315060510, folder: 'other' }, 'abcd'),
    )
  })
})

describe('/api/uploads/signature', () => {
  const env = {
    CLOUDINARY_CLOUD_NAME: 'unit-cloud',
    CLOUDINARY_API_KEY: 'unit-api-key',
    CLOUDINARY_API_SECRET: 'unit-api-secret',
  }
  // 2026-10-23T12:00:00Z
  const now = new Date('2026-10-23T12:00:00.000Z')

  beforeEach(() => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', env.CLOUDINARY_CLOUD_NAME)
    vi.stubEnv('CLOUDINARY_API_KEY', env.CLOUDINARY_API_KEY)
    vi.stubEnv('CLOUDINARY_API_SECRET', env.CLOUDINARY_API_SECRET)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    auth.mockReset()
    auth.mockResolvedValue(sessionFor('admin'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])(
    '%s returns 405 with Allow: POST',
    async (method) => {
      const res = await call(await loadHandler(), method)
      expect(res.statusCode).toBe(405)
      expect(res.headers.allow).toBe('POST')
    },
  )

  it('POST with no session returns 401 and no signature', async () => {
    auth.mockResolvedValue(null)
    const res = await call(await loadHandler(), 'POST')
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toHaveProperty('signature')
  })

  it('POST with a user session returns 403 and no signature', async () => {
    auth.mockResolvedValue(sessionFor('user'))
    const res = await call(await loadHandler(), 'POST')
    expect(res.statusCode).toBe(403)
    expect(res.body).not.toHaveProperty('signature')
  })

  it('POST as admin returns 200 with the upload params and a signature that verifies against them', async () => {
    const res = await call(await loadHandler(), 'POST')
    expect(res.statusCode).toBe(200)

    const { cloudName, apiKey, timestamp, signature, folder, allowedFormats, transformation } =
      res.body
    expect(cloudName).toBe(env.CLOUDINARY_CLOUD_NAME)
    expect(apiKey).toBe(env.CLOUDINARY_API_KEY)
    expect(Number(timestamp)).toBe(Math.floor(now.getTime() / 1000))
    expect(folder).toBe('recipes')
    // Sent to Cloudinary as a comma-separated string; accept either shape here.
    const formats = Array.isArray(allowedFormats) ? allowedFormats.join(',') : allowedFormats
    expect(formats.split(',').sort()).toEqual(
      ['avif', 'heic', 'jpeg', 'jpg', 'png', 'webp'],
    )
    expect(transformation).toMatch(/c_limit/)
    expect(transformation).toMatch(/w_2000/)
    expect(transformation).toMatch(/h_2000/)

    // Recompute Cloudinary's SHA-1 signature independently: signed params
    // sorted by name, joined with &, secret appended.
    const toSign =
      `allowed_formats=${formats}&folder=${folder}&timestamp=${timestamp}` +
      `&transformation=${transformation}`
    const expected = createHash('sha1')
      .update(toSign + env.CLOUDINARY_API_SECRET)
      .digest('hex')
    expect(signature).toBe(expected)
  })

  it('POST as admin never returns the API secret', async () => {
    const res = await call(await loadHandler(), 'POST')
    expect(res.statusCode).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain(env.CLOUDINARY_API_SECRET)
  })

  it.each(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])(
    'throws when %s is missing',
    async (name) => {
      vi.stubEnv(name, undefined)
      // Fail fast may happen at import or at request time; either is fine.
      await expect(
        (async () => call(await loadHandler(), 'POST'))(),
      ).rejects.toThrow()
    },
  )
})
