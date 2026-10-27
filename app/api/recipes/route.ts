import { LISTING_RATE_LIMIT, LISTING_RATE_WINDOW_MS } from '../../../lib/constants'
import { toCardData } from '../../../lib/recipes/card'
import { listPublished, parseListingParams, type ListingSearchParams } from '../../../lib/recipes/listing'
import { clientIp, createRateLimiter } from '../../../lib/signinRateLimit'

// GET /api/recipes?...: the /recipes grid's next pages, as card data. Takes
// the same params as the page. Rate limited per client IP.

export const runtime = 'nodejs'

const limiter = createRateLimiter({ limit: LISTING_RATE_LIMIT, windowMs: LISTING_RATE_WINDOW_MS })

// Like the pages, which render per request, responses stay out of shared caches.
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
}

// As Next passes search params to a page: a repeated param becomes an array.
function toListingSearchParams(searchParams: URLSearchParams): ListingSearchParams {
  const params: ListingSearchParams = {}
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    params[key] = values.length > 1 ? values : values[0]
  }
  return params
}

export async function GET(request: Request): Promise<Response> {
  const hit = limiter.hit(clientIp(request))
  if (!hit.allowed) {
    return json({ error: 'Too many requests' }, 429, { 'Retry-After': String(hit.retryAfterSeconds) })
  }

  const query = parseListingParams(toListingSearchParams(new URL(request.url).searchParams))
  if (!query) return json({ error: 'Invalid listing' }, 400)

  const { recipes, nextCursor } = await listPublished(query)
  return json({ recipes: recipes.map(toCardData), nextCursor })
}
