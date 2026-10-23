export const NAV_LINKS = [
  { name: 'Home', href: '/' },
  { name: 'Recipes', href: '/recipes' },
  { name: 'Add Recipe', href: '/new', adminOnly: true },
] as const

export const RECIPE_SORT_OPTIONS = [
  { value: 'descending', label: 'Newest' },
  { value: 'ascending', label: 'Oldest' },
] as const

// Total time is prepTime + cookTime, in minutes.
export const TIME_FILTERS = [
  { value: '<=80', label: 'Total Time: ~1 Hour' },
  { value: '>80', label: 'Total Time: > 1 Hour' },
] as const

export const RECIPE_PAGE_SIZE = 24

export const MAX_RECIPE_TAGS = 10
