import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FunnelIcon } from '@heroicons/react/24/outline'
import RecipeCard from '../../components/RecipeCard'
import RecipeFilters from '../../components/RecipeFilters'
import { listPublished, parseListingParams, type ListingSearchParams } from '../../lib/recipes/listing'
import { listingHref } from '../../lib/recipes/listingHref'
import { publishedTagsInUse } from '../../lib/recipes/queries'

export const metadata: Metadata = { title: 'Llamas Kitchen - Recipes' }

export default async function RecipesPage({ searchParams }: { searchParams: Promise<ListingSearchParams> }) {
  const query = parseListingParams(await searchParams)
  if (!query) notFound()
  const [{ recipes, nextCursor }, tagsInUse] = await Promise.all([listPublished(query), publishedTagsInUse()])

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="py-12 sm:py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">Recipes</h1>
        <p className="mt-4 text-lg text-muted">Everything from the Llama's Kitchen collection.</p>
      </div>

      <RecipeFilters state={{ tags: query.tags, time: query.time, sort: query.sort }} tagsInUse={tagsInUse} />

      <section aria-labelledby="recipes-heading" className="mt-8">
        <h2 id="recipes-heading" className="sr-only">
          Recipes
        </h2>
        {recipes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
            <FunnelIcon className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
            <p className="mt-4 text-base text-muted">No recipes match these filters.</p>
            <Link href="/recipes" className="mt-4 inline-block font-semibold text-accent hover:underline">
              Clear all
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recipes.map((recipe) => (
              <RecipeCard key={String(recipe._id)} recipe={recipe} />
            ))}
          </div>
        )}
      </section>

      {nextCursor && (
        <nav aria-label="Pagination" className="mt-12 flex justify-center">
          <Link
            href={listingHref(query, nextCursor)}
            className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-5 text-base font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft"
          >
            More recipes
          </Link>
        </nav>
      )}
    </main>
  )
}
