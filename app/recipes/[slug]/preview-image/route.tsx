import { PREVIEW_IMAGE_RATE_LIMIT, PREVIEW_IMAGE_RATE_WINDOW_MS } from '../../../../lib/constants'
import { previewCard } from '../../../../lib/previewImage'
import { getRecipeBySlug } from '../../../../lib/recipes/queries'
import { clientIp, createRateLimiter } from '../../../../lib/signinRateLimit'

// GET /recipes/<slug>/preview-image: a published recipe's generated link-preview
// card, used when it has no photo. Rate limited per client IP, since each
// request renders an image.

export const runtime = 'nodejs'

const limiter = createRateLimiter({ limit: PREVIEW_IMAGE_RATE_LIMIT, windowMs: PREVIEW_IMAGE_RATE_WINDOW_MS })

// One fixed answer for a missing, pending or rejected slug, so none can be told apart.
function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'private, no-store' },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const hit = limiter.hit(clientIp(request))
  if (!hit.allowed) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'private, no-store', 'Retry-After': String(hit.retryAfterSeconds) },
    })
  }

  const recipe = await getRecipeBySlug((await params).slug)
  if (recipe?.status !== 'published') return notFound()

  return previewCard(recipe.name, 'public, max-age=3600')
}
