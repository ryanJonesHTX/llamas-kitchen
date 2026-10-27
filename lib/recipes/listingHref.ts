import type { ListingQuery } from './listing'

// The /recipes URL for a listing state, optionally continuing after a cursor.
// Kept apart from listing.ts so client components can import it without the database code.
// Newest is the default sort, so it is left out.
export function listingHref(state: Pick<ListingQuery, 'tags' | 'time' | 'sort' | 'q'>, after?: string): string {
  const search = listingSearch(state, after)
  return search ? `/recipes?${search}` : '/recipes'
}

// The same params as a search string without the "?", as /api/recipes takes them.
export function listingSearch(
  { tags, time, sort, q }: Pick<ListingQuery, 'tags' | 'time' | 'sort' | 'q'>,
  after?: string
): string {
  const params = new URLSearchParams()
  if (q !== undefined) params.set('q', q)
  for (const tag of tags) params.append('tag', tag)
  if (time) params.set('time', time)
  if (sort !== 'newest') params.set('sort', sort)
  if (after) params.set('after', after)
  return params.toString()
}
