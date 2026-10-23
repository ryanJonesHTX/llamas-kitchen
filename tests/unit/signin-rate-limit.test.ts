import { describe, expect, it, vi } from 'vitest'
import {
  createRateLimiter,
  createResendSigninGuard,
} from '../../lib/signinRateLimit'

const WINDOW_MS = 15 * 60 * 1000

describe('createRateLimiter', () => {
  it('allows up to the limit for a key and blocks the next hit', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 0 })

    expect(limiter.hit('a')).toEqual({ allowed: true })
    expect(limiter.hit('a')).toEqual({ allowed: true })
    expect(limiter.hit('a')).toEqual({ allowed: true })
    expect(limiter.hit('a').allowed).toBe(false)
  })

  it('reports the seconds left in the window, rounded up, when blocking', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t })

    limiter.hit('a')
    t = 10_000
    limiter.hit('a')
    t = 20_500
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 40 })
  })

  it('counts each key independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 })

    expect(limiter.hit('a')).toEqual({ allowed: true })
    expect(limiter.hit('b')).toEqual({ allowed: true })
    expect(limiter.hit('a').allowed).toBe(false)
    expect(limiter.hit('b').allowed).toBe(false)
  })

  it('allows the key again once the window has passed', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => t })

    limiter.hit('a')
    t = 59_999
    expect(limiter.hit('a').allowed).toBe(false)
    t = 60_000
    expect(limiter.hit('a')).toEqual({ allowed: true })
  })

  it('prunes keys whose window has expired', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => t })

    limiter.hit('a')
    limiter.hit('b')
    expect(limiter.size()).toBe(2)

    t = 60_000
    limiter.hit('c')
    expect(limiter.size()).toBe(1)
  })
})

const RESEND_URL = 'http://localhost:3000/api/auth/signin/resend'

function signinRequest(
  url: string,
  { email, xff }: { email?: string; xff?: string } = {}
): Request {
  const body = new URLSearchParams({ csrfToken: 'token' })
  if (email !== undefined) body.set('email', email)
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  }
  if (xff !== undefined) headers['x-forwarded-for'] = xff
  return new Request(url, { method: 'POST', headers, body })
}

function passThrough() {
  return vi.fn<(request: Request) => Promise<Response>>(async () => new Response('ok'))
}

function rawResendRequest(contentType: string, body: string, xff: string): Request {
  return new Request(RESEND_URL, {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-forwarded-for': xff },
    body,
  })
}

// Sends six resend POSTs, one per body, each from its own IP so only the
// email limit can trip. Returns the six statuses.
async function statusesForBodies(
  contentType: string,
  bodies: string[]
): Promise<number[]> {
  const guard = createResendSigninGuard({ now: () => 0 })
  const next = passThrough()
  const statuses: number[] = []
  for (const [i, body] of bodies.entries()) {
    const res = await guard(rawResendRequest(contentType, body, `10.0.1.${i}`), next)
    statuses.push(res.status)
  }
  return statuses
}

const FORM = 'application/x-www-form-urlencoded'

describe('createResendSigninGuard', () => {
  it('rejects the 6th magic-link request for the same email with 429 and Retry-After', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()

    for (let i = 0; i < 5; i++) {
      const res = await guard(
        signinRequest(RESEND_URL, { email: 'victim@example.com', xff: `10.0.0.${i}` }),
        next
      )
      expect(res.status).toBe(200)
    }
    expect(next).toHaveBeenCalledTimes(5)

    const blocked = await guard(
      signinRequest(RESEND_URL, { email: 'victim@example.com', xff: '10.0.0.99' }),
      next
    )
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe(String(WINDOW_MS / 1000))
    expect(next).toHaveBeenCalledTimes(5)
  })

  it('treats case and whitespace variants of an email as the same address', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()
    const variants = [
      'victim@example.com',
      'Victim@Example.com',
      '  victim@example.com',
      'VICTIM@EXAMPLE.COM  ',
      ' ViCtIm@eXaMpLe.CoM ',
    ]

    for (const [i, email] of variants.entries()) {
      await guard(signinRequest(RESEND_URL, { email, xff: `10.0.0.${i}` }), next)
    }
    const blocked = await guard(
      signinRequest(RESEND_URL, { email: 'victim@example.com', xff: '10.0.0.99' }),
      next
    )
    expect(blocked.status).toBe(429)
    expect(next).toHaveBeenCalledTimes(5)
  })

  it('rejects the 21st request from one client IP across different emails', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()

    for (let i = 0; i < 20; i++) {
      const res = await guard(
        signinRequest(RESEND_URL, { email: `user${i}@example.com`, xff: '203.0.113.7' }),
        next
      )
      expect(res.status).toBe(200)
    }
    const blocked = await guard(
      signinRequest(RESEND_URL, { email: 'user20@example.com', xff: '203.0.113.7' }),
      next
    )
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe(String(WINDOW_MS / 1000))
    expect(next).toHaveBeenCalledTimes(20)
  })

  it('keys the IP limit on the last X-Forwarded-For entry, so a spoofed first entry does not evade it', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()

    for (let i = 0; i < 20; i++) {
      await guard(
        signinRequest(RESEND_URL, {
          email: `user${i}@example.com`,
          xff: `198.51.100.${i}, 203.0.113.7`,
        }),
        next
      )
    }
    const blocked = await guard(
      signinRequest(RESEND_URL, {
        email: 'user20@example.com',
        xff: '198.51.100.250, 203.0.113.7',
      }),
      next
    )
    expect(blocked.status).toBe(429)
    expect(next).toHaveBeenCalledTimes(20)
  })

  it('still IP-limits a request with no email and passes allowed ones to Auth.js', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()

    for (let i = 0; i < 20; i++) {
      const res = await guard(signinRequest(RESEND_URL, { xff: '203.0.113.7' }), next)
      expect(res.status).toBe(200)
    }
    const blocked = await guard(signinRequest(RESEND_URL, { xff: '203.0.113.7' }), next)
    expect(blocked.status).toBe(429)
    expect(next).toHaveBeenCalledTimes(20)
  })

  it('never limits other auth POSTs such as GitHub sign-in or sign-out', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()
    const urls = [
      'http://localhost:3000/api/auth/signin/github',
      'http://localhost:3000/api/auth/signout',
    ]

    for (const url of urls) {
      for (let i = 0; i < 30; i++) {
        const request = signinRequest(url, {
          email: 'victim@example.com',
          xff: '203.0.113.7',
        })
        const res = await guard(request, next)
        expect(res.status).toBe(200)
        expect(next).toHaveBeenLastCalledWith(request)
      }
    }
    expect(next).toHaveBeenCalledTimes(60)
  })

  it('passes an allowed request to Auth.js with its form body still readable', async () => {
    const guard = createResendSigninGuard({ now: () => 0 })
    const next = passThrough()
    const request = signinRequest(RESEND_URL, {
      email: 'Chef@Example.com',
      xff: '203.0.113.7',
    })

    const res = await guard(request, next)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(next).toHaveBeenCalledTimes(1)
    const forwarded = next.mock.calls[0][0]
    const form = await forwarded.formData()
    expect(form.get('email')).toBe('Chef@Example.com')
    expect(form.get('csrfToken')).toBe('token')
  })

  // The guard must key on the same address Auth.js will email. Auth.js reads
  // the body with Object.fromEntries (last duplicate wins), accepts JSON, and
  // normalizes with NFKC + lowercase + trim and cuts the domain at ','.
  it('limits by the last email when the form repeats the email field, as Auth.js does', async () => {
    const bodies = Array.from(
      { length: 6 },
      (_, i) => `csrfToken=t&email=rand${i}%40x.com&email=victim%40example.com`
    )
    expect(await statusesForBodies(FORM, bodies)).toEqual([200, 200, 200, 200, 200, 429])
  })

  it('email-limits a JSON body the same way as a form body', async () => {
    const bodies = Array.from({ length: 6 }, () =>
      JSON.stringify({ csrfToken: 't', email: 'victim@example.com' })
    )
    expect(await statusesForBodies('application/json', bodies)).toEqual([
      200, 200, 200, 200, 200, 429,
    ])
  })

  it('treats addresses with a comma suffix on the domain as the same address', async () => {
    const bodies = Array.from({ length: 6 }, (_, i) =>
      new URLSearchParams({ csrfToken: 't', email: `victim@example.com,${i + 1}` }).toString()
    )
    expect(await statusesForBodies(FORM, bodies)).toEqual([200, 200, 200, 200, 200, 429])
  })

  it('treats a fullwidth Unicode variant as the same address after NFKC normalization', async () => {
    const bodies = [
      ...Array.from({ length: 5 }, () => 'victim@example.com'),
      'ｖictim@example.com', // fullwidth 'v'
    ].map((email) => new URLSearchParams({ csrfToken: 't', email }).toString())
    expect(await statusesForBodies(FORM, bodies)).toEqual([200, 200, 200, 200, 200, 429])
  })
})
