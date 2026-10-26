import { SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS, SEARCH_RESULT_LIMIT } from '../../../lib/constants'
import { recipeImageUrl } from '../../../lib/recipes/image'
import { searchPublished } from '../../../lib/recipes/queries'
import { searchQueryParam } from '../../../lib/recipes/search'
import { searchWords } from '../../../lib/recipes/searchWords'
import { clientIp, createRateLimiter } from '../../../lib/signinRateLimit'

// GET /api/search?q=...: the search dialog's live results, the top published
// matches for q. Rate limited per client IP, since every keystroke can query.

export const runtime = 'nodejs'

// One result row. imageUrl is a small thumbnail, or null without an image.
export type SearchResult = { name: string; slug: string; tags: string[]; imageUrl: string | null }

const limiter = createRateLimiter({ limit: SEARCH_RATE_LIMIT, windowMs: SEARCH_RATE_WINDOW_MS })

// Like the pages, which render per request, responses stay out of shared caches.
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
}

export async function GET(request: Request): Promise<Response> {
  const hit = limiter.hit(clientIp(request))
  if (!hit.allowed) {
    return json({ error: 'Too many searches' }, 429, { 'Retry-After': String(hit.retryAfterSeconds) })
  }

  // A repeated q reaches the parser as an array, which it rejects, as on /recipes.
  const values = new URL(request.url).searchParams.getAll('q')
  const parsed = searchQueryParam.safeParse(values.length > 1 ? values : values[0])
  if (!parsed.success) return json({ error: 'Invalid search' }, 400)

  const words = parsed.data === undefined ? [] : searchWords(parsed.data)
  if (words.length === 0) return json({ results: [] })

  const hits = await searchPublished(words, SEARCH_RESULT_LIMIT)
  const results: SearchResult[] = hits.map(({ name, slug, tags, imagePublicId }) => ({
    name,
    slug,
    tags,
    imageUrl: imagePublicId ? recipeImageUrl(imagePublicId, 'thumb') : null,
  }))
  return json({ results })
}
