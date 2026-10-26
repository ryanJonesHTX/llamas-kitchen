import { describe, expect, it, vi } from 'vitest'
import {
  clientIp,
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

  it('sweeps expired keys at most once per window', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => t })

    limiter.hit('a')
    t = 30_000
    limiter.hit('b')
    t = 60_000
    limiter.hit('c') // sweeps: 'a' has expired
    expect(limiter.size()).toBe(2)

    t = 90_000
    limiter.hit('d') // 'b' has expired, but the last sweep was under a window ago
    expect(limiter.size()).toBe(3)

    t = 120_000
    limiter.hit('e') // sweeps: 'b' and 'c' have expired; 'd' has not
    expect(limiter.size()).toBe(2)
  })

  it('does not scan the keys on every hit', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => t })
    for (let i = 0; i < 100; i++) limiter.hit(`key${i}`)

    // The sweep is the only Map iteration in hit(). Counts are read before
    // restoring, so expect's own iteration can't add to them.
    const iterator = vi.spyOn(Map.prototype, Symbol.iterator)
    let scansWithinWindow: number
    let scansAfterWindow: number
    try {
      for (let i = 0; i < 100; i++) {
        t = i * 100
        limiter.hit(`other${i}`)
      }
      scansWithinWindow = iterator.mock.calls.length
      t = 60_000
      limiter.hit('later')
      scansAfterWindow = iterator.mock.calls.length
    } finally {
      iterator.mockRestore()
    }
    expect(scansWithinWindow).toBe(0)
    expect(scansAfterWindow).toBe(1)
  })

  it('starts a fresh window for an expired key that has not been swept yet', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => t })

    t = 30_000
    limiter.hit('a')
    t = 60_000
    limiter.hit('b') // sweeps; 'a' has 30s left
    t = 90_000
    expect(limiter.size()).toBe(2) // 'a' expired but is still stored
    expect(limiter.hit('a')).toEqual({ allowed: true })
    t = 100_000
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 50 })
  })
})

function keyFor(xff: string | undefined): string {
  const headers: Record<string, string> = xff === undefined ? {} : { 'x-forwarded-for': xff }
  return clientIp(new Request('http://localhost:3000/api/search', { headers }))
}

describe('clientIp', () => {
  it("returns 'direct' without an X-Forwarded-For header", () => {
    expect(keyFor(undefined)).toBe('direct')
  })

  it('returns the last X-Forwarded-For entry', () => {
    expect(keyFor('198.51.100.1, 203.0.113.7')).toBe('203.0.113.7')
    expect(keyFor(' 203.0.113.7 ')).toBe('203.0.113.7')
  })

  it('returns an IPv4-mapped IPv6 address as the IPv4 address', () => {
    expect(keyFor('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(keyFor('::FFFF:203.0.113.7')).toBe('203.0.113.7')
    expect(keyFor('0:0:0:0:0:ffff:cb00:7107')).toBe('203.0.113.7')
  })

  it('keys an IPv6 address by its /64 prefix', () => {
    expect(keyFor('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(keyFor('::1')).toBe('0:0:0:0::/64')
    expect(keyFor('::')).toBe('0:0:0:0::/64')
    expect(keyFor('64:ff9b::203.0.113.7')).toBe('64:ff9b:0:0::/64')
  })

  it('gives every spelling of the same /64 the same key', () => {
    const spellings = [
      '2001:db8:0:a::1',
      '2001:0db8:0000:000a:0000:0000:0000:0001',
      '2001:DB8:0:A::1',
      '2001:db8::a:0:0:0:1',
      '2001:db8:0:a:ffff:ffff:ffff:ffff',
      '2001:db8:0:a::99%eth0',
      '2001:db8:0:a::1.2.3.4',
    ]
    for (const xff of spellings) expect(keyFor(`198.51.100.1, ${xff}`)).toBe('2001:db8:0:a::/64')
  })

  it('drops a zone id', () => {
    expect(keyFor('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(keyFor('FE80::abcd%25')).toBe('fe80:0:0:0::/64')
  })

  it('uses an entry that is not an IP address as-is', () => {
    expect(keyFor('unknown')).toBe('unknown')
    expect(keyFor('1.2.3.4, 01.2.3.4')).toBe('01.2.3.4')
  })

  it('puts two addresses in one /64 in one bucket and different /64s in different ones', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 })

    expect(limiter.hit(keyFor('2001:db8:0:a::1'))).toEqual({ allowed: true })
    expect(limiter.hit(keyFor('2001:db8:0:a:dead:beef:0:2')).allowed).toBe(false)
    expect(limiter.hit(keyFor('2001:db8:0:b::1'))).toEqual({ allowed: true })
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
