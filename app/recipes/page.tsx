import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
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
    <div className="bg-bg">
      <main className="pb-24">
        <div className="py-16 px-4 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-bold tracking-tight text-text">Recipes</h1>
        </div>

        <RecipeFilters state={{ tags: query.tags, time: query.time, sort: query.sort }} tagsInUse={tagsInUse} />

        <section aria-labelledby="recipes-heading" className="mx-auto max-w-7xl overflow-hidden sm:px-6 lg:px-8">
          <h2 id="recipes-heading" className="sr-only">
            Recipes
          </h2>
          {recipes.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted">
              <p>No recipes match these filters.</p>
              <Link href="/recipes" className="mt-4 inline-block font-medium text-accent hover:underline">
                Clear all
              </Link>
            </div>
          ) : (
            <div className="-mx-px grid grid-cols-2 border-l border-border sm:mx-0 md:grid-cols-3 lg:grid-cols-4">
              {recipes.map((recipe) => (
                <RecipeCard key={String(recipe._id)} recipe={recipe} />
              ))}
            </div>
          )}
        </section>

        {nextCursor && (
          <nav aria-label="Pagination" className="mx-auto mt-6 flex max-w-7xl justify-center px-4 text-sm font-medium sm:px-6 lg:px-8">
            <Link
              href={listingHref(query, nextCursor)}
              className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 text-muted hover:bg-primary-soft"
            >
              More recipes
            </Link>
          </nav>
        )}
      </main>
    </div>
  )
}
