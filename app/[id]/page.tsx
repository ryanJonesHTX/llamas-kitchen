import { notFound, permanentRedirect } from 'next/navigation'
import { getPublishedSlugById } from '../../lib/recipes/queries'

// Old recipe URLs were /<ObjectId>: a permanent redirect (308) to the slug URL
// for a published recipe. Every other single-segment URL gets the not-found
// page. Static segments (/recipes, /new, /api) and public files match first.
export default async function OldRecipeUrl({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const slug = await getPublishedSlugById(id)
  if (!slug) notFound()
  permanentRedirect(`/recipes/${slug}`)
}
