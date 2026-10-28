import { previewCard } from '../../lib/previewImage'

// GET /preview-image: the site's link-preview card, rendered once at build.
// The card's wordmark names the site, so the title is a tagline.

export const runtime = 'nodejs'
export const dynamic = 'force-static'

const TAGLINE = 'Recipes from friends and family'

export function GET(): Response {
  return previewCard(TAGLINE, 'public, max-age=86400')
}
