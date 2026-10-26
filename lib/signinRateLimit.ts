// In-memory limits for magic-link sign-in emails; createRateLimiter also
// limits image uploads (app/recipes/actions.ts) and, with clientIp, searches
// (app/api/search/route.ts). Production runs a single
// `next start` process, so per-process state is the whole picture.
// Server-only: node:net keeps it out of client bundles.
import { isIP } from 'node:net'

const WINDOW_MS = 15 * 60 * 1000
const EMAIL_LIMIT = 5
const IP_LIMIT = 20

type HitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

// Fixed window per key, starting at the key's first hit. Expired keys are
// swept at most once per window, so a hit doesn't scan every key.
export function createRateLimiter({
  limit,
  windowMs,
  now = () => Date.now(),
}: {
  limit: number
  windowMs: number
  now?: () => number
}) {
  const windows = new Map<string, { start: number; count: number }>()
  let lastSweep = now()

  function hit(key: string): HitResult {
    const t = now()
    if (t >= lastSweep + windowMs) {
      for (const [k, w] of windows) {
        if (t >= w.start + windowMs) windows.delete(k)
      }
      lastSweep = t
    }

    const window = windows.get(key)
    if (!window || t >= window.start + windowMs) {
      windows.set(key, { start: t, count: 1 })
      return { allowed: true }
    }
    if (window.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((window.start + windowMs - t) / 1000),
      }
    }
    window.count++
    return { allowed: true }
  }

  return { hit, size: () => windows.size }
}

// Nginx's proxy_add_x_forwarded_for appends the real client, so earlier
// entries can be spoofed; only the last one is trustworthy. An IPv6 client is
// keyed by its /64, since one host can rotate addresses within it. An entry
// that isn't an IP is used as-is: it means Nginx is misconfigured, and
// throwing would fail every request.
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff === null) return 'direct'
  const entry = xff.split(',').at(-1)!.trim()
  return isIP(entry) === 6 ? ipv6Key(entry) : entry
}

// '2001:db8:0:a::/64' for any address in that /64, or the IPv4 address for an
// IPv4-mapped one. Takes an address isIP has accepted.
function ipv6Key(address: string): string {
  const hextets = expandIpv6(address.split('%')[0])
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    return [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff].join('.')
  }
  return `${hextets.slice(0, 4).map((h) => h.toString(16)).join(':')}::/64`
}

// The eight 16-bit groups of a valid IPv6 address without a zone id.
function expandIpv6(address: string): number[] {
  const [head, tail] = address.split('::')
  const groups = (part: string | undefined) => (part ? part.split(':') : [])
  const toHextets = (parts: string[]) =>
    parts.flatMap((part) => {
      if (!part.includes('.')) return [parseInt(part, 16)]
      const [a, b, c, d] = part.split('.').map(Number)
      return [(a << 8) | b, (c << 8) | d]
    })
  const left = toHextets(groups(head))
  if (tail === undefined) return left
  const right = toHextets(groups(tail))
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right]
}

// Reads the email the way Auth.js's getBody (@auth/core/lib/utils/web.js) does.
async function signinEmail(request: Request): Promise<string | null> {
  const clone = request.clone()
  const contentType = clone.headers.get('content-type') ?? ''
  let email: unknown
  if (contentType.includes('application/json')) {
    // Malformed JSON leaves only the IP limit; Auth.js rejects the request itself.
    email = await clone.json().then((body) => body?.email, () => undefined)
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    email = Object.fromEntries(new URLSearchParams(await clone.text())).email
  }
  return typeof email === 'string' && email ? emailKey(email) : null
}

// Mirrors Auth.js's defaultNormalizer key, without its throwing validation.
function emailKey(email: string): string {
  const normalized = email.normalize('NFKC').toLowerCase().trim()
  const at = normalized.indexOf('@')
  if (at === -1) return normalized
  return `${normalized.slice(0, at)}@${normalized.slice(at + 1).split(',')[0]}`
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response('Too many sign-in emails requested. Try again later.', {
    status: 429,
    headers: { 'Retry-After': String(retryAfterSeconds), 'Content-Type': 'text/plain' },
  })
}

// Wraps Auth.js's POST handler so the Resend magic-link endpoint can't be
// used to flood an inbox or burn the Resend quota.
export function createResendSigninGuard({ now }: { now?: () => number } = {}) {
  const byEmail = createRateLimiter({ limit: EMAIL_LIMIT, windowMs: WINDOW_MS, now })
  const byIp = createRateLimiter({ limit: IP_LIMIT, windowMs: WINDOW_MS, now })

  return async function guard<R extends Request>(
    request: R,
    next: (request: R) => Promise<Response>
  ): Promise<Response> {
    if (!new URL(request.url).pathname.endsWith('/signin/resend')) return next(request)

    const ipResult = byIp.hit(clientIp(request))
    if (!ipResult.allowed) return tooManyRequests(ipResult.retryAfterSeconds)

    const email = await signinEmail(request)
    if (email) {
      const emailResult = byEmail.hit(email)
      if (!emailResult.allowed) return tooManyRequests(emailResult.retryAfterSeconds)
    }

    return next(request)
  }
}
