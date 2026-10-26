import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FunnelIcon } from '@heroicons/react/24/outline'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import RecipeCard from '../../components/RecipeCard'
import RecipeFilters from '../../components/RecipeFilters'
import RecipeGridSkeleton from '../../components/RecipeGridSkeleton'
import { MAX_SEARCH_QUERY_LENGTH } from '../../lib/constants'
import {
  listPublished,
  parseListingParams,
  type ListingQuery,
  type ListingSearchParams,
} from '../../lib/recipes/listing'
import { listingHref } from '../../lib/recipes/listingHref'
import { publishedTagsInUse } from '../../lib/recipes/queries'

export const metadata: Metadata = { title: 'Llamas Kitchen - Recipes' }

export default async function RecipesPage({ searchParams }: { searchParams: Promise<ListingSearchParams> }) {
  const query = parseListingParams(await searchParams)
  if (!query) notFound()

  // Invalid params 404 above, before the boundary starts streaming with a 200.
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="py-12 sm:py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">Recipes</h1>
        <p className="mt-4 text-lg text-muted">Everything from the Llama's Kitchen collection.</p>
      </div>

      <SearchForm query={query} />

      <Suspense fallback={<RecipeGridSkeleton />}>
        <RecipeResults query={query} />
      </Suspense>
    </div>
  )
}

// A plain GET form, so it works without JavaScript. It keeps the filters and
// sort in hidden inputs and leaves out the cursor, so a new search starts at
// the first page.
function SearchForm({ query }: { query: ListingQuery }) {
  return (
    <form method="get" action="/recipes" role="search" className="mb-6 flex max-w-xl gap-x-2">
      <label htmlFor="recipe-search" className="sr-only">
        Search recipes
      </label>
      <div className="relative min-w-0 flex-1">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute inset-y-0 left-3 h-full w-5 text-muted"
          aria-hidden="true"
        />
        {/* Keyed by the search, so client navigation to another search resets the field. */}
        <input
          key={query.q}
          id="recipe-search"
          type="search"
          name="q"
          defaultValue={query.q}
          maxLength={MAX_SEARCH_QUERY_LENGTH}
          placeholder="Search by name, ingredient or tag"
          className="min-h-11 w-full rounded-md border border-border-strong bg-surface py-2 pr-3 pl-10 text-text shadow-xs placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden sm:text-sm lg:min-h-0"
        />
      </div>
      {query.tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}
      {query.time && <input type="hidden" name="time" value={query.time} />}
      {query.sort !== 'newest' && <input type="hidden" name="sort" value={query.sort} />}
      <button
        type="submit"
        className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-semibold text-on-primary shadow-xs hover:bg-primary/90 lg:min-h-0 lg:py-2"
      >
        Search
      </button>
    </form>
  )
}

function emptyMessage({ q, tags, time }: ListingQuery): string {
  const filtered = tags.length > 0 || time !== undefined
  if (q === undefined) return 'No recipes match these filters.'
  return filtered ? 'No recipes match this search and these filters.' : 'No recipes match this search.'
}

// The filters, grid and pagination: everything that reads the database.
async function RecipeResults({ query }: { query: ListingQuery }) {
  const [{ recipes, nextCursor }, tagsInUse] = await Promise.all([listPublished(query), publishedTagsInUse()])

  return (
    <>
      <RecipeFilters state={{ tags: query.tags, time: query.time, sort: query.sort, q: query.q }} tagsInUse={tagsInUse} />

      <section aria-labelledby="recipes-heading" className="mt-8">
        <h2 id="recipes-heading" className="sr-only">
          Recipes
        </h2>
        {query.q !== undefined && (
          <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-lg font-semibold break-words text-text">Results for “{query.q}”</p>
            <Link
              href={listingHref({ ...query, q: undefined })}
              className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline lg:min-h-0"
            >
              Clear search
            </Link>
          </div>
        )}
        {recipes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
            <FunnelIcon className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
            <p className="mt-4 text-base text-muted">{emptyMessage(query)}</p>
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
    </>
  )
}
