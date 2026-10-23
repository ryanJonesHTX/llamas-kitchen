// Seed data for the e2e suite. Every name starts with "E2E " so tests can
// prove the app is reading this in-memory data and nothing else.

// The in-memory MongoDB listens on a fixed local port so that both the test
// server and the test workers (which reseed between tests) can reach it.
// It is always 127.0.0.1: the suite can never point at a remote database.
export const E2E_MONGODB_PORT = 27100
export const E2E_MONGODB_DB = 'llamas-kitchen-e2e'

// Cloudinary's public demo image. Image optimisation may fail offline; that
// only affects how images render, never what the tests assert.
const photo = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'

const ingredients = (...items: string[]) =>
  items.map((ingredient, id) => ({ id, ingredient }))

export const seedRecipes = [
  {
    _id: '65a000000000000000000001',
    name: 'E2E Beef Stew',
    description: 'Slow cooked beef stew.',
    directions: 'Brown the beef.\nSimmer for two hours.',
    ingredients: ingredients('Stewing beef', 'Carrots', 'Beef stock'),
    prepTime: 20,
    cookTime: 120,
    photo,
    cloudinaryId: 'e2e-beef-stew',
    category: 'Beef',
    submittedBy: 'E2E Chef',
    notes: '',
    createdAt: new Date('2024-01-01T12:00:00Z'),
  },
  {
    _id: '65a000000000000000000002',
    name: 'E2E Chicken Tacos',
    description: 'Quick weeknight tacos.',
    directions: 'Cook the chicken and fill the tortillas.',
    ingredients: ingredients('Chicken thighs', 'Tortillas', 'Salsa'),
    prepTime: 15,
    cookTime: 20,
    photo,
    cloudinaryId: 'e2e-chicken-tacos',
    category: 'Chicken',
    submittedBy: 'E2E Chef',
    notes: '',
    createdAt: new Date('2024-02-01T12:00:00Z'),
  },
  {
    _id: '65a000000000000000000003',
    name: 'E2E Beef Burgers',
    description: 'Classic grilled burgers.',
    directions: 'Shape the patties and grill.',
    ingredients: ingredients('Ground beef', 'Buns'),
    prepTime: 10,
    cookTime: 15,
    photo,
    cloudinaryId: 'e2e-beef-burgers',
    category: 'Beef',
    submittedBy: 'E2E Chef',
    notes: '',
    createdAt: new Date('2024-03-01T12:00:00Z'),
  },
  {
    _id: '65a000000000000000000004',
    name: 'E2E Chicken Curry',
    description: 'A rich, slow simmered curry.',
    directions: 'Fry the spices, add the chicken and simmer.',
    ingredients: ingredients('Chicken breast', 'Curry paste', 'Coconut milk'),
    prepTime: 20,
    cookTime: 70,
    photo,
    cloudinaryId: 'e2e-chicken-curry',
    category: 'Chicken',
    submittedBy: 'E2E Chef',
    notes: '',
    createdAt: new Date('2024-04-01T12:00:00Z'),
  },
  {
    _id: '65a000000000000000000005',
    name: 'E2E Pork Chops',
    description: 'Pan seared pork chops.',
    directions: 'Season and sear the chops.',
    ingredients: ingredients('Pork chops', 'Butter'),
    prepTime: 10,
    cookTime: 20,
    photo,
    cloudinaryId: 'e2e-pork-chops',
    category: 'Pork',
    submittedBy: 'E2E Chef',
    notes: '',
    createdAt: new Date('2024-05-01T12:00:00Z'),
  },
]
