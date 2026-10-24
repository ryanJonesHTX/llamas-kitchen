import { getPublishedSlugById } from '../../lib/recipes/queries'

// Old recipe URLs were /<ObjectId>. Until T7 moves this to a route handler,
// it only redirects: 301 to the slug URL for a published recipe, else 404.
export default function OldRecipeUrl() {
  return null
}

export async function getServerSideProps({ params }) {
  const slug = await getPublishedSlugById(params.id)
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/recipes/${slug}`, statusCode: 301 } }
}
