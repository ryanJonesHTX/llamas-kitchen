// Seed data for the e2e suite, in the recipe model's shape
// (lib/recipes/model.ts). Every name starts with "E2E " so tests can prove the
// app is reading this in-memory data and nothing else.

// The in-memory MongoDB listens on a fixed local port so that both the test
// server and the test workers (which reseed between tests) can reach it.
// It is always 127.0.0.1: the suite can never point at a remote database.
export const E2E_MONGODB_PORT = 27100
export const E2E_MONGODB_DB = 'llamas-kitchen-e2e'

// The admin who submitted every seed recipe. Never signed in by a test, so a
// kept submittedBy can be told apart from one overwritten with the editor.
export const SEED_ADMIN_ID = '64e000000000000000000001'

// The non-admin who submitted the pending and rejected seed recipes. Tests
// sign in with this id (signInAs's id) to view them as their owner.
export const SEED_SUBMITTER_ID = '64e000000000000000000002'

type Ingredient = { quantity: number | null; unit: string | null; item: string }

export type SeedRecipe = {
  _id: string
  name: string
  slug: string
  description: string
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  prepTime: number
  cookTime: number
  tags: string[]
  imagePublicId: string
  credit?: string
  notes?: string
  sourceUrl?: string
  submittedBy: string
  status: 'published' | 'pending' | 'rejected'
  rejectionReason?: string
  publishedAt?: Date
  createdAt: Date
}

const published = (
  recipe: Omit<SeedRecipe, 'submittedBy' | 'status' | 'imagePublicId'>
): SeedRecipe => ({
  ...recipe,
  imagePublicId: `recipes/${recipe.slug}`,
  submittedBy: SEED_ADMIN_ID,
  status: 'published',
})

export const publishedRecipes: SeedRecipe[] = [
  published({
    _id: '65a000000000000000000001',
    name: 'E2E Beef Stew',
    slug: 'e2e-beef-stew',
    description: 'Slow cooked beef stew.',
    ingredients: [
      { quantity: 2, unit: 'lb', item: 'stewing beef' },
      { quantity: 3, unit: null, item: 'carrots' },
      { quantity: 4, unit: 'cups', item: 'beef stock' },
    ],
    steps: ['Brown the beef.', 'Simmer for two hours.'],
    servings: 6,
    prepTime: 20,
    cookTime: 120,
    tags: ['beef', 'stew'],
    credit: 'Grandma Llama',
    notes: 'Even better the next day.',
    sourceUrl: 'https://example.com/recipes/beef-stew',
    publishedAt: new Date('2024-01-01T12:00:00Z'),
    createdAt: new Date('2024-01-01T12:00:00Z'),
  }),
  published({
    _id: '65a000000000000000000002',
    name: 'E2E Chicken Tacos',
    slug: 'e2e-chicken-tacos',
    description: 'Quick weeknight tacos.',
    ingredients: [
      { quantity: 1, unit: 'lb', item: 'chicken thighs' },
      { quantity: 8, unit: null, item: 'tortillas' },
    ],
    steps: ['Cook the chicken.', 'Fill the tortillas.'],
    servings: 4,
    prepTime: 15,
    cookTime: 20,
    tags: ['chicken'],
    publishedAt: new Date('2024-02-01T12:00:00Z'),
    createdAt: new Date('2024-02-01T12:00:00Z'),
  }),
  published({
    _id: '65a000000000000000000003',
    name: 'E2E Beef Burgers',
    slug: 'e2e-beef-burgers',
    description: 'Classic grilled burgers.',
    ingredients: [
      { quantity: 1, unit: 'lb', item: 'ground beef' },
      { quantity: 4, unit: null, item: 'buns' },
    ],
    steps: ['Shape the patties.', 'Grill them.'],
    servings: 4,
    prepTime: 10,
    cookTime: 15,
    tags: ['beef'],
    publishedAt: new Date('2024-03-01T12:00:00Z'),
    createdAt: new Date('2024-03-01T12:00:00Z'),
  }),
  published({
    _id: '65a000000000000000000004',
    name: 'E2E Chicken Curry',
    slug: 'e2e-chicken-curry',
    description: 'A rich, slow simmered curry.',
    ingredients: [
      { quantity: 1, unit: 'lb', item: 'chicken breast' },
      { quantity: 1, unit: 'can', item: 'coconut milk' },
    ],
    steps: ['Fry the spices.', 'Add the chicken and simmer.'],
    servings: 4,
    prepTime: 20,
    cookTime: 70,
    tags: ['chicken', 'curry'],
    publishedAt: new Date('2024-04-01T12:00:00Z'),
    createdAt: new Date('2024-04-01T12:00:00Z'),
  }),
  published({
    _id: '65a000000000000000000005',
    name: 'E2E Pork Chops',
    slug: 'e2e-pork-chops',
    description: 'Pan seared pork chops.',
    ingredients: [
      { quantity: 4, unit: null, item: 'pork chops' },
      { quantity: 2, unit: 'tbsp', item: 'butter' },
    ],
    steps: ['Season the chops.', 'Sear them.'],
    servings: 4,
    prepTime: 10,
    cookTime: 20,
    tags: ['pork'],
    publishedAt: new Date('2024-05-01T12:00:00Z'),
    createdAt: new Date('2024-05-01T12:00:00Z'),
  }),
]

// Never public. Created after every published recipe and tagged like them, so
// a reader that forgets the status filter (or sorts by createdAt) shows them.
export const pendingRecipe: SeedRecipe = {
  _id: '65a000000000000000000006',
  name: 'E2E Pending Beef Pie',
  slug: 'e2e-pending-beef-pie',
  description: 'Awaiting review.',
  ingredients: [{ quantity: 1, unit: 'lb', item: 'minced beef' }],
  steps: ['Fill the pastry and bake.'],
  servings: 4,
  prepTime: 30,
  cookTime: 45,
  // "pie" is on no other recipe, so a tag suggestion that leaks it shows.
  tags: ['beef', 'pie'],
  imagePublicId: 'recipes/e2e-pending-beef-pie',
  submittedBy: SEED_SUBMITTER_ID,
  status: 'pending',
  createdAt: new Date('2024-06-01T12:00:00Z'),
}

export const rejectedRecipe: SeedRecipe = {
  _id: '65a000000000000000000007',
  name: 'E2E Rejected Chicken Bake',
  slug: 'e2e-rejected-chicken-bake',
  description: 'Not accepted.',
  ingredients: [{ quantity: 1, unit: 'lb', item: 'chicken wings' }],
  steps: ['Bake the chicken.'],
  servings: 2,
  prepTime: 10,
  cookTime: 30,
  tags: ['chicken'],
  imagePublicId: 'recipes/e2e-rejected-chicken-bake',
  submittedBy: SEED_SUBMITTER_ID,
  status: 'rejected',
  rejectionReason: 'Not a recipe.',
  createdAt: new Date('2024-07-01T12:00:00Z'),
}

export const hiddenRecipes = [pendingRecipe, rejectedRecipe]

export const seedRecipes: SeedRecipe[] = [...publishedRecipes, ...hiddenRecipes]

export function seedRecipe(name: string): SeedRecipe {
  const found = seedRecipes.find((recipe) => recipe.name === name)
  if (!found) throw new Error(`No seed recipe named ${name}`)
  return found
}
