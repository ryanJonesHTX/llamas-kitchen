'use client'

import Link from 'next/link'
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import type { RecipeCardData } from '../lib/recipes/card'
import type { ListingQuery } from '../lib/recipes/listing'
import { listingHref, listingSearch } from '../lib/recipes/listingHref'
import RecipeCard from './RecipeCard'

// The /recipes grid: the server's page of cards, then the pages appended from
// /api/recipes, when the end of the grid comes near the viewport or from the
// "More recipes" button. The URL stays the same. Without JavaScript, "More
// recipes" is a link to the next page.

type ListingState = Pick<ListingQuery, 'tags' | 'time' | 'sort' | 'q'>
type RecipePage = { recipes: RecipeCardData[]; nextCursor: string | null }

// Loads start this far before the end of the grid scrolls into view.
const AUTO_LOAD_MARGIN = '0px 0px 600px 0px'

const noSubscription = () => () => {}

// False on the server and while hydrating, so the link renders until the button works.
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  )
}

const controlClass =
  'inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-5 text-base font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft'

export default function RecipeGrid({ state, firstPage }: { state: ListingState; firstPage: RecipePage }) {
  const hydrated = useHydrated()
  const [appended, setAppended] = useState<RecipeCardData[]>([])
  const [nextCursor, setNextCursor] = useState(firstPage.nextCursor)
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [announcement, setAnnouncement] = useState('')
  // Whether any load has succeeded, so the end line only follows an append.
  const [loadedMore, setLoadedMore] = useState(false)
  // The request in flight, so there is only ever one, and unmounting aborts it.
  const inFlight = useRef<AbortController | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  async function loadMore() {
    if (inFlight.current || nextCursor === null) return
    const controller = new AbortController()
    inFlight.current = controller
    setStatus('loading')
    // Emptied first, so the same count twice in a row is still a change to announce.
    setAnnouncement('')
    try {
      const response = await fetch(`/api/recipes?${listingSearch(state, nextCursor)}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`loading recipes failed with ${response.status}`)
      const page: RecipePage = await response.json()
      setAppended((recipes) => [...recipes, ...page.recipes])
      setNextCursor(page.nextCursor)
      setAnnouncement(`Loaded ${page.recipes.length} more ${page.recipes.length === 1 ? 'recipe' : 'recipes'}`)
      setLoadedMore(true)
      setStatus('idle')
    } catch {
      if (!controller.signal.aborted) setStatus('failed')
    } finally {
      inFlight.current = null
    }
  }

  const onSentinelVisible = useEffectEvent(() => loadMore())
  // Watches only while a load could start: not while one runs, nor after a failure until "Try again".
  const autoLoad = nextCursor !== null && status === 'idle'
  useEffect(() => {
    if (!autoLoad) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onSentinelVisible()
      },
      { rootMargin: AUTO_LOAD_MARGIN }
    )
    observer.observe(sentinel.current!)
    return () => observer.disconnect()
  }, [autoLoad])

  useEffect(() => () => inFlight.current?.abort(), [])

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...firstPage.recipes, ...appended].map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
      <div ref={sentinel} />

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {nextCursor !== null && (
        <nav aria-label="Pagination" className="mt-12 flex flex-col items-center gap-y-4">
          {status === 'failed' && <p role="alert" className="text-base text-text">Couldn't load more recipes.</p>}
          {hydrated ? (
            // One button, relabelled after a failure, so keyboard focus stays on it throughout.
            // aria-disabled, not disabled, which would blur it; loadMore ignores clicks while loading.
            <button
              type="button"
              aria-disabled={status === 'loading'}
              onClick={loadMore}
              className={`${controlClass} aria-disabled:cursor-wait aria-disabled:opacity-60`}
            >
              {status === 'failed' ? 'Try again' : 'More recipes'}
            </button>
          ) : (
            <Link href={listingHref(state, nextCursor)} className={controlClass}>
              More recipes
            </Link>
          )}
        </nav>
      )}
      {nextCursor === null && loadedMore && (
        <p className="mt-12 text-center text-sm text-muted">That's every recipe.</p>
      )}
    </>
  )
}
