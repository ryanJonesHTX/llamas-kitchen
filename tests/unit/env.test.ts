import { afterEach, describe, expect, it, vi } from 'vitest'
import { register } from '../../instrumentation'
import { missingEnv, REQUIRED_ENV } from '../../lib/env'

// Written out by hand so the test also pins down which vars are required.
const required = [
  'MONGODB_URI',
  'AUTH_SECRET',
  'AUTH_URL',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'AUTH_RESEND_KEY',
  'EMAIL_FROM',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
]

const fullEnv = (): Record<string, string | undefined> =>
  Object.fromEntries(required.map((name) => [name, `fake-${name}`]))

describe('REQUIRED_ENV', () => {
  it('lists exactly the required vars, and not ADMIN_EMAILS', () => {
    expect([...REQUIRED_ENV].sort()).toEqual([...required].sort())
  })
})

describe('missingEnv', () => {
  it('reports nothing when every required var is set', () => {
    expect(missingEnv(fullEnv())).toEqual([])
  })

  it.each(required)('reports %s when it is unset', (name) => {
    const env = fullEnv()
    delete env[name]
    expect(missingEnv(env)).toEqual([name])
  })

  it.each(required)('reports %s when it is an empty string', (name) => {
    expect(missingEnv({ ...fullEnv(), [name]: '' })).toEqual([name])
  })

  it('reports every missing var at once', () => {
    expect([...missingEnv({})].sort()).toEqual([...required].sort())
  })

  it('does not report ADMIN_EMAILS when it is absent', () => {
    const env = fullEnv()
    expect(env).not.toHaveProperty('ADMIN_EMAILS')
    expect(missingEnv(env)).toEqual([])
  })
})

describe('register (server startup)', () => {
  const stubAll = (env: Record<string, string | undefined>) => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    for (const name of required) vi.stubEnv(name, env[name])
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('starts when every required var is set', async () => {
    stubAll(fullEnv())
    await expect(register()).resolves.toBeUndefined()
  })

  it('refuses to start, naming every missing var in one error', async () => {
    stubAll({
      ...fullEnv(),
      AUTH_URL: undefined,
      EMAIL_FROM: '',
      CLOUDINARY_API_SECRET: undefined,
    })

    const error = await register().then(
      () => {
        throw new Error('register() did not throw')
      },
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(Error)
    const { message } = error as Error
    for (const name of ['AUTH_URL', 'EMAIL_FROM', 'CLOUDINARY_API_SECRET']) {
      expect(message).toContain(name)
    }
    for (const name of ['MONGODB_URI', 'AUTH_SECRET', 'AUTH_GITHUB_ID']) {
      expect(message).not.toContain(name)
    }
  })
})
