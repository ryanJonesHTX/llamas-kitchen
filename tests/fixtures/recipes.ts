import { Types } from 'mongoose'

// New-shape recipe documents (.claude/SCHEMA-PROPOSAL.md) for the lib/recipes tests.

export const adminId = new Types.ObjectId('64b000000000000000000001')

export const day = (n: number) => new Date(Date.UTC(2024, 0, n, 12))

// A valid published recipe with only the required fields. Pass
// `publishedAt: undefined` with a non-published status to leave it absent.
export function recipeDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Beef Stew',
    slug: 'beef-stew',
    description: 'Hearty and warm.',
    ingredients: [
      { quantity: 2, unit: 'cups', item: 'beef stock' },
      { quantity: null, unit: null, item: 'Salt to taste' },
    ],
    steps: ['Brown the beef.', 'Simmer for two hours.'],
    servings: 4,
    prepTime: 20,
    cookTime: 120,
    tags: ['main dish'],
    submittedBy: adminId,
    status: 'published',
    publishedAt: day(1),
    ...overrides,
  }
}

export const pendingDoc = (overrides: Record<string, unknown> = {}) =>
  recipeDoc({ status: 'pending', publishedAt: undefined, ...overrides })

export const rejectedDoc = (overrides: Record<string, unknown> = {}) =>
  recipeDoc({ status: 'rejected', publishedAt: undefined, rejectionReason: 'Not a recipe.', ...overrides })
