import type { ListingQuery } from './listing'

// The /recipes URL for a listing state, optionally continuing after a cursor.
// Kept apart from listing.ts so client components can import it without the database code.
// Newest is the default sort, so it is left out.
export function listingHref({ tags, time, sort }: Pick<ListingQuery, 'tags' | 'time' | 'sort'>, after?: string): string {
  const params = new URLSearchParams()
  for (const tag of tags) params.append('tag', tag)
  if (time) params.set('time', time)
  if (sort !== 'newest') params.set('sort', sort)
  if (after) params.set('after', after)
  const search = params.toString()
  return search ? `/recipes?${search}` : '/recipes'
}
