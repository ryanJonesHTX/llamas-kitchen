export const NAV_LINKS = [
  { name: 'Home', href: '/' },
  { name: 'Recipes', href: '/recipes' },
  { name: 'Add Recipe', href: '/new', adminOnly: true },
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
