export const NAV_LINKS = [
  { name: 'Home', href: '/' },
  { name: 'Recipes', href: '/recipes' },
  { name: 'Add Recipe', href: '/new', signedInOnly: true },
  { name: 'Review', href: '/admin/queue', adminOnly: true },
] as const

export const RECIPE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
] as const

// Total time is prepTime + cookTime, in minutes.
export const TIME_FILTERS = [
  { value: 'quick', label: 'Total Time: ~1 Hour' },
  { value: 'long', label: 'Total Time: > 1 Hour' },
] as const

export const RECIPE_PAGE_SIZE = 24

export const MAX_RECIPE_NAME_LENGTH = 120

export const MAX_RECIPE_TAGS = 10

// Chosen with room over the longest values on dev; `npm run check-recipe-data` reports a database's longest values.
export const MAX_RECIPE_DESCRIPTION_LENGTH = 1000
export const MAX_RECIPE_NOTES_LENGTH = 4000
export const MAX_RECIPE_CREDIT_LENGTH = 200
export const MAX_RECIPE_STEP_LENGTH = 2000
export const MAX_RECIPE_STEPS = 100
export const MAX_INGREDIENT_ITEM_LENGTH = 200
export const MAX_INGREDIENT_UNIT_LENGTH = 40
export const MAX_RECIPE_INGREDIENTS = 100
export const MAX_RECIPE_TAG_LENGTH = 40

// The largest ingredient quantity, in whatever unit it has.
export const MAX_INGREDIENT_QUANTITY = 10000

// Recipes a non-admin may have awaiting review at once. Admins are exempt.
export const MAX_PENDING_PER_USER = 5

// The submitter sees the reason on their recipe page.
export const MAX_REJECTION_REASON_LENGTH = 500

// Image uploads a non-admin may make per window. Admins are exempt.
export const UPLOAD_RATE_LIMIT = 20
export const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000

// Recipe search: the longest query in characters, and the most distinct words.
export const MAX_SEARCH_QUERY_LENGTH = 100
export const MAX_SEARCH_WORDS = 6

// /api/search requests per client IP per window, and the most results it returns.
export const SEARCH_RATE_LIMIT = 60
export const SEARCH_RATE_WINDOW_MS = 60 * 1000
export const SEARCH_RESULT_LIMIT = 8

// /api/recipes requests per client IP per window: the /recipes grid's next pages.
export const LISTING_RATE_LIMIT = 120
export const LISTING_RATE_WINDOW_MS = 60 * 1000

// The most servings the recipe page's stepper scales to, unless the recipe itself serves more.
export const MAX_SCALED_SERVINGS = 100
