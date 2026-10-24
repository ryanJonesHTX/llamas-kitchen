import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Recipe } from '../../lib/recipes/model'
import { recipeInputSchema } from '../../lib/recipes/input'
import { convertRecipe, migratedRecipeSchema } from '../../scripts/migrate-recipes-v2/convert'
import { migrate } from '../../scripts/migrate-recipes-v2/migrate'
import { day } from '../fixtures/recipes'

// The migration (raw mongodb driver, own target schema) and the app's new
// model must agree in both directions:
// - every recipe the migration writes is valid for the model, unchanged;
// - every recipe the app writes through the model passes isMigrated, so a
//   re-run of the migration skips it.
//
// The old-shape fixtures are the successful conversions from
// migrate-convert.test.ts and migrate-run.test.ts, copied so those tests stay untouched.

type Doc = Record<string, unknown>

const adminUserId = new ObjectId('64b000000000000000000001')

function oldRecipe(overrides: Doc = {}): Doc {
  return {
    _id: new ObjectId(),
    name: 'Beef Stew',
    description: 'Hearty and warm.',
    directions: 'Brown the beef.\nSimmer for two hours.',
    ingredients: [
      { id: 'a1', ingredient: '2 cups beef stock' },
      { id: 'a2', ingredient: 'Salt to taste' },
    ],
    prepTime: 20,
    cookTime: 120,
    photo: '',
    cloudinaryId: 'recipes/beef-stew',
    category: 'Main Dish',
    submittedBy: 'Grandma',
    notes: 'Better the next day.',
    createdAt: new Date('2021-03-04T05:06:07.000Z'),
    updatedAt: new Date('2022-01-02T03:04:05.000Z'),
    __v: 0,
    ...overrides,
  }
}

function withoutKeys(...keys: string[]): Doc {
  const doc = oldRecipe()
  for (const key of keys) delete doc[key]
  return doc
}

const photo = (path: string) => `https://res.cloudinary.com/demo/image/upload/${path}`

const convertible: [string, Doc][] = [
  ['a clean recipe', oldRecipe()],
  ['a later __v', oldRecipe({ __v: 3 })],
  ['padded name and description', oldRecipe({ name: '  Beef Stew  ', description: '\tHearty. ' })],
  [
    'mixed and blank ingredients',
    oldRecipe({
      ingredients: [
        { id: 'a', ingredient: '1 1/2 cups flour' },
        { id: 'b', ingredient: '   ' },
        { id: 'c', ingredient: '' },
        { id: 'd', ingredient: '3 eggs' },
        { id: 'e', ingredient: '2 lbs beef' },
        { id: 'f', ingredient: '½ tsp salt' },
      ],
    }),
  ],
  ['CRLF directions with blank lines', oldRecipe({ directions: '  Mix.\r\n\r\nBake 30 min.  \n\n   \nServe.\r\n' })],
  ['zero times', oldRecipe({ prepTime: 0, cookTime: 0 })],
  ['string times', oldRecipe({ prepTime: '15', cookTime: '25' })],
  ...['Main Dish', '  Soup  ', 'Sweets', 'DESSERT', 'Select a Category', '', '   '].map(
    (category): [string, Doc] => [`category ${JSON.stringify(category)}`, oldRecipe({ category })]
  ),
  ['no category', withoutKeys('category')],
  [
    'cloudinaryId and photo',
    oldRecipe({ cloudinaryId: 'recipes/stew', photo: photo('v1612345678/other/id.jpg') }),
  ],
  ...[
    'v1612345678/recipes/beef-stew.jpg',
    'c_fill,w_300,h_200/v1612345678/a/b/c.png',
    'v42/sample.webp',
    'c_fill,w_300/e_sepia/v1/recipes/a.jpg',
    't_thumb/v1/recipes/a.jpg',
    'v1/my_folder/a.jpg',
  ].map((path): [string, Doc] => [`photo ${path}`, oldRecipe({ cloudinaryId: '', photo: photo(path) })]),
  ['photo without cloudinaryId', { ...withoutKeys('cloudinaryId'), photo: photo('v1/recipes/pie.jpg') }],
  ['no image (empty)', oldRecipe({ cloudinaryId: '', photo: '' })],
  ['no image (missing)', withoutKeys('cloudinaryId', 'photo')],
  ['padded credit', oldRecipe({ submittedBy: '  Serious Eats ' })],
  ['blank credit', oldRecipe({ submittedBy: '   ' })],
  ['no credit', withoutKeys('submittedBy')],
  ['padded notes', oldRecipe({ notes: '  Freeze leftovers.\n' })],
  ['blank notes', oldRecipe({ notes: '' })],
  ['no notes', withoutKeys('notes')],
  ['a 120-character name', oldRecipe({ name: 'x'.repeat(120) })],
]

function converted(oldDoc: Doc): Doc {
  const result = convertRecipe(oldDoc, { adminUserId, slug: 'beef-stew-2' })
  if (!('doc' in result)) throw new Error(`expected a conversion: ${result.problems.join('; ')}`)
  return result.doc
}

// ObjectIds and Dates as strings, so the mongodb 6 and Mongoose (mongodb 7)
// bson classes compare by value.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('migration output against the new model', () => {
  it.each(convertible)('a converted recipe with %s is valid', (_label, oldDoc) => {
    const errors = new Recipe(converted(oldDoc)).validateSync()?.errors
    expect(Object.keys(errors ?? {})).toEqual([])
  })

  it.each(convertible)('the model keeps a converted recipe with %s unchanged', (_label, oldDoc) => {
    const doc = converted(oldDoc)
    expect(plain(new Recipe(doc).toObject())).toEqual(plain(doc))
  })
})

describe('app-created recipes against the migration', () => {
  let mongo: MongoMemoryServer
  let client: MongoClient
  const dbName = 'recipes-migration-compat-test'

  // What a form submits, parsed by the shared input schema; the server adds the rest.
  const input = recipeInputSchema.parse({
    name: 'Weeknight Chili',
    description: 'Quick and smoky.',
    ingredients: [
      { quantity: 1, unit: 'lb', item: 'ground beef' },
      { quantity: 1.5, unit: 'cups', item: 'kidney beans' },
      { quantity: 2, unit: null, item: 'onions' },
      { quantity: null, unit: null, item: 'Salt to taste' },
    ],
    steps: ['Brown the beef.', 'Add everything else.', 'Simmer.'],
    servings: '6',
    prepTime: '10',
    cookTime: '30',
    tags: ['Main Dish', 'quick'],
    notes: '',
  })
  const withOptional = recipeInputSchema.parse({
    ...input,
    imagePublicId: 'recipes/chili',
    notes: 'Freezes well.',
    credit: 'Serious Eats',
    sourceUrl: 'https://www.seriouseats.com/chili',
  })

  // The model is typed with Mongoose's (bson 7) ObjectId; adminUserId is the
  // migration driver's (bson 6), used for the users insert and migrate().
  const appAdminId = new Types.ObjectId(adminUserId.toHexString())
  const appRecipes = [
    { ...input, slug: 'weeknight-chili', submittedBy: appAdminId, status: 'published' as const, publishedAt: day(5) },
    {
      ...withOptional,
      slug: 'weeknight-chili-2',
      submittedBy: appAdminId,
      status: 'published' as const,
      publishedAt: day(6),
    },
    { ...input, slug: 'weeknight-chili-3', submittedBy: new Types.ObjectId(), status: 'pending' as const },
    {
      ...input,
      slug: 'weeknight-chili-4',
      submittedBy: new Types.ObjectId(),
      status: 'rejected' as const,
      rejectionReason: 'Duplicate.',
    },
  ]

  // Read back with the migration's own driver, as a re-run would.
  async function storedRecipes(): Promise<Doc[]> {
    return client.db(dbName).collection('recipes').find().sort({ slug: 1 }).toArray()
  }

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(dbName))
    await Recipe.create(appRecipes)
    client = await new MongoClient(mongo.getUri()).connect()
    await client.db(dbName).collection('users').insertOne({ _id: adminUserId, email: 'admin@example.com', role: 'admin' })
  })

  afterAll(async () => {
    await client?.close()
    await mongoose.disconnect()
    await mongo?.stop()
  })

  it('stores every app-created recipe in the shape isMigrated accepts', async () => {
    const docs = await storedRecipes()
    expect(docs).toHaveLength(appRecipes.length)
    for (const doc of docs) {
      const result = migratedRecipeSchema.safeParse(doc)
      expect(result.error?.issues ?? [], `recipe ${doc.slug}`).toEqual([])
    }
  })

  it('is skipped by a re-run of the migration, which changes nothing', async () => {
    const before = await storedRecipes()
    const report = await migrate({ db: client.db(dbName), adminUserId: adminUserId.toHexString(), apply: true })
    expect(report.totals).toEqual({ convert: 0, skip: appRecipes.length, problem: 0 })
    expect(await storedRecipes()).toEqual(before)
  })
})
