import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { type Db, MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { migrate, writeConverted } from '../../scripts/migrate-recipes-v2/migrate'
import { convertRecipe, isMigrated } from '../../scripts/migrate-recipes-v2/convert'

// Runs the migration against an in-memory MongoDB on a random port. Each test
// gets its own database, so tests don't depend on each other or on order.
//
// Report shape these tests rely on:
//   { recipes: [{ _id, name, outcome: 'convert' | 'skip' | 'problem',
//                 problems?: string[], slug?: string, tags?: string[],
//                 stepCount?: number, unparsedIngredients?: string[],
//                 imageSource?: 'cloudinaryId' | 'photo' | 'none' }],
//     totals: { convert, skip, problem } }
// `slug` is listed for both converted and skipped recipes.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const run = promisify(execFile)

let mongo: MongoMemoryServer
let client: MongoClient
let dbCount = 0

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  client = await new MongoClient(mongo.getUri()).connect()
})

afterAll(async () => {
  await client?.close()
  await mongo?.stop()
})

type Doc = Record<string, unknown> & { _id: ObjectId }
type ReportRecipe = {
  _id: unknown
  name: unknown
  outcome: 'convert' | 'skip' | 'problem'
  problems?: string[]
  slug?: string
  tags?: string[]
  stepCount?: number
  unparsedIngredients?: string[]
  imageSource?: string
}
type Report = {
  recipes: ReportRecipe[]
  totals: { convert: number; skip: number; problem: number }
}

const adminId = new ObjectId()
const userId = new ObjectId()

const day = (n: number) => new Date(Date.UTC(2021, 0, n, 12))

function oldRecipe(overrides: Partial<Doc> = {}): Doc {
  const createdAt = (overrides.createdAt as Date | undefined) ?? day(1)
  return {
    _id: new ObjectId(),
    name: 'Plain Toast',
    description: 'Toast.',
    directions: 'Toast the bread.',
    ingredients: [{ id: '1', ingredient: '2 slices bread' }],
    prepTime: 1,
    cookTime: 3,
    photo: '',
    cloudinaryId: 'recipes/toast',
    category: 'Breakfast',
    submittedBy: 'Ryan',
    notes: '',
    createdAt,
    updatedAt: new Date(createdAt.getTime() + 60_000),
    __v: 0,
    ...overrides,
  }
}

// Old-shape fixtures, including the messy ones found in production.
function messyFixtures(): Doc[] {
  return [
    oldRecipe({
      name: 'Beef Stew',
      createdAt: day(1),
      category: 'Main Dish',
      directions: 'Brown the beef.\r\n\r\nAdd stock.\r\nSimmer.',
      ingredients: [
        { id: '1', ingredient: '2 lbs beef' },
        { id: '2', ingredient: '' },
        { id: '3', ingredient: 'Salt to taste' },
        { id: '4', ingredient: '   ' },
      ],
    }),
    oldRecipe({
      name: 'Brownies',
      createdAt: day(2),
      category: 'Sweets',
      prepTime: '15',
      cookTime: '25',
      cloudinaryId: '',
      photo: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_400/v1612345678/recipes/brownies.jpg',
    }),
    oldRecipe({
      name: 'Mystery Dish',
      createdAt: day(3),
      category: 'Select a Category',
      cloudinaryId: '',
      photo: '',
    }),
  ]
}

async function freshDb(recipes: Doc[] = []): Promise<Db> {
  const db = client.db(`migrate-run-${++dbCount}`)
  await db.collection('users').insertMany([
    { _id: adminId, email: 'admin@example.com', role: 'admin' },
    { _id: userId, email: 'user@example.com', role: 'user' },
  ])
  if (recipes.length) await db.collection('recipes').insertMany(recipes)
  return db
}

async function stored(db: Db): Promise<Doc[]> {
  return (await db.collection('recipes').find().sort({ _id: 1 }).toArray()) as Doc[]
}

async function migrateDb(db: Db, apply: boolean): Promise<Report> {
  return (await migrate({ db, adminUserId: adminId.toHexString(), apply })) as Report
}

function entry(report: Report, id: ObjectId): ReportRecipe {
  const found = report.recipes.find((recipe) => String(recipe._id) === id.toHexString())
  if (!found) throw new Error(`no report entry for ${id}`)
  return found
}

describe('migrate preconditions', () => {
  it('throws for a non-admin user id', async () => {
    const db = await freshDb(messyFixtures())
    await expect(migrate({ db, adminUserId: userId.toHexString(), apply: false })).rejects.toThrow()
  })

  it('throws for an id that matches no user', async () => {
    const db = await freshDb(messyFixtures())
    await expect(
      migrate({ db, adminUserId: new ObjectId().toHexString(), apply: false })
    ).rejects.toThrow()
  })

  it('throws for an id that is not a valid ObjectId', async () => {
    const db = await freshDb(messyFixtures())
    await expect(migrate({ db, adminUserId: 'not-an-id', apply: false })).rejects.toThrow()
  })
})

describe('migrate dry run', () => {
  it('writes nothing and reports every conversion', async () => {
    const fixtures = messyFixtures()
    const db = await freshDb(fixtures)
    const before = await stored(db)

    const report = await migrateDb(db, false)

    expect(await stored(db)).toEqual(before)
    expect(report.totals).toEqual({ convert: 3, skip: 0, problem: 0 })

    const [stew, brownies, mystery] = fixtures
    expect(entry(report, stew._id)).toMatchObject({
      outcome: 'convert',
      slug: 'beef-stew',
      tags: ['main dish'],
      stepCount: 3,
      unparsedIngredients: ['Salt to taste'],
      imageSource: 'cloudinaryId',
    })
    expect(entry(report, brownies._id)).toMatchObject({
      outcome: 'convert',
      slug: 'brownies',
      tags: ['dessert'],
      stepCount: 1,
      unparsedIngredients: [],
      imageSource: 'photo',
      imagePublicId: 'recipes/brownies',
      photo: brownies.photo,
    })
    expect(entry(report, stew._id)).not.toHaveProperty('photo')
    expect(entry(report, mystery._id)).toMatchObject({
      outcome: 'convert',
      slug: 'mystery-dish',
      tags: [],
      imageSource: 'none',
    })
  })
})

describe('migrate apply', () => {
  it('converts every recipe and keeps _id, createdAt and updatedAt', async () => {
    const fixtures = messyFixtures()
    const db = await freshDb(fixtures)

    const report = await migrateDb(db, true)

    expect(report.totals).toEqual({ convert: 3, skip: 0, problem: 0 })
    const after = await stored(db)
    expect(after).toHaveLength(3)
    for (const original of fixtures) {
      const doc = after.find((d) => d._id.equals(original._id))!
      expect(doc, `recipe ${original.name}`).toBeDefined()
      expect(isMigrated(doc)).toBe(true)
      expect(doc.createdAt).toEqual(original.createdAt)
      expect(doc.updatedAt).toEqual(original.updatedAt)
      expect(String(doc.submittedBy)).toBe(adminId.toHexString())
    }

    const brownies = after.find((d) => d._id.equals(fixtures[1]._id))!
    expect(brownies).toMatchObject({
      slug: 'brownies',
      tags: ['dessert'],
      prepTime: 15,
      cookTime: 25,
      imagePublicId: 'recipes/brownies',
      credit: 'Ryan',
    })
    const stew = after.find((d) => d._id.equals(fixtures[0]._id))!
    expect(stew.steps).toEqual(['Brown the beef.', 'Add stock.', 'Simmer.'])
    expect(stew.ingredients).toHaveLength(2)
  })

  it('skips everything when run again after an apply', async () => {
    const db = await freshDb(messyFixtures())
    await migrateDb(db, true)
    const afterFirst = await stored(db)

    const report = await migrateDb(db, true)

    expect(report.totals).toEqual({ convert: 0, skip: 3, problem: 0 })
    expect(report.recipes.every((recipe) => recipe.outcome === 'skip')).toBe(true)
    expect(await stored(db)).toEqual(afterFirst)
  })

  it('writes nothing at all when one recipe has a problem', async () => {
    const bad = oldRecipe({ name: 'Bad Times', prepTime: 'about ten', createdAt: day(9) })
    const db = await freshDb([...messyFixtures(), bad])
    const before = await stored(db)

    const report = await migrateDb(db, true)

    expect(await stored(db)).toEqual(before)
    expect(report.totals).toEqual({ convert: 3, skip: 0, problem: 1 })
    const problem = entry(report, bad._id)
    expect(problem.outcome).toBe('problem')
    expect(problem.problems?.some((p) => p.includes('prepTime'))).toBe(true)
  })
})

describe('writeConverted', () => {
  function convertedDoc(original: Doc) {
    const result = convertRecipe(original, { adminUserId: adminId, slug: 'plain-toast' })
    if (!('doc' in result)) throw new Error(result.problems.join('; '))
    return result.doc
  }

  it('throws, naming the _id, when the recipe was edited after it was read', async () => {
    const original = oldRecipe()
    const db = await freshDb([original])
    const doc = convertedDoc(original)
    await db.collection('recipes').updateOne({ _id: original._id }, { $set: { updatedAt: day(30), name: 'Edited' } })

    await expect(writeConverted(db.collection('recipes'), [doc])).rejects.toThrow(original._id.toHexString())
    expect((await stored(db))[0]).toMatchObject({ name: 'Edited', category: 'Breakfast' })
  })

  it('throws, naming the _id, when the recipe was deleted after it was read', async () => {
    const original = oldRecipe()
    const db = await freshDb([original])
    const doc = convertedDoc(original)
    await db.collection('recipes').deleteOne({ _id: original._id })

    await expect(writeConverted(db.collection('recipes'), [doc])).rejects.toThrow(original._id.toHexString())
    expect(await stored(db)).toEqual([])
  })
})

describe('migrate problems', () => {
  it('reports a recipe with an unknown key, naming the key', async () => {
    const odd = oldRecipe({ name: 'Odd One', rating: 5 })
    const db = await freshDb([odd])

    const report = await migrateDb(db, false)

    const problem = entry(report, odd._id)
    expect(problem.outcome).toBe('problem')
    expect(problem.problems?.some((p) => p.includes('rating'))).toBe(true)
    expect(report.totals).toEqual({ convert: 0, skip: 0, problem: 1 })
  })

  it('reports a recipe with a blank name as a problem instead of throwing', async () => {
    const nameless = oldRecipe({ name: '   ' })
    const db = await freshDb([nameless])

    const report = await migrateDb(db, false)

    expect(entry(report, nameless._id).outcome).toBe('problem')
  })
})

describe('migrate slugs', () => {
  it('gives two recipes with the same name -2 in createdAt order, not insertion order', async () => {
    // The newer recipe is inserted first and has the smaller _id.
    const newer = oldRecipe({ _id: new ObjectId('640000000000000000000001'), name: 'Beef Stew', createdAt: day(20) })
    const older = oldRecipe({ _id: new ObjectId('640000000000000000000002'), name: 'Beef Stew', createdAt: day(10) })
    const db = await freshDb([newer, older])

    const report = await migrateDb(db, true)

    expect(entry(report, older._id).slug).toBe('beef-stew')
    expect(entry(report, newer._id).slug).toBe('beef-stew-2')
    const after = await stored(db)
    expect(after.find((d) => d._id.equals(older._id))!.slug).toBe('beef-stew')
    expect(after.find((d) => d._id.equals(newer._id))!.slug).toBe('beef-stew-2')
  })

  it('breaks a createdAt tie by _id and counts up -2, -3', async () => {
    const ids = ['650000000000000000000003', '650000000000000000000001', '650000000000000000000002']
    const db = await freshDb(
      ids.map((id) => oldRecipe({ _id: new ObjectId(id), name: 'Mac & Cheese', createdAt: day(5) }))
    )

    const report = await migrateDb(db, false)

    expect(entry(report, new ObjectId(ids[1])).slug).toBe('mac-and-cheese')
    expect(entry(report, new ObjectId(ids[2])).slug).toBe('mac-and-cheese-2')
    expect(entry(report, new ObjectId(ids[0])).slug).toBe('mac-and-cheese-3')
  })

  it('gives the dry run and the apply that follows the same slugs', async () => {
    const db = await freshDb([
      oldRecipe({ name: 'Pie', createdAt: day(2) }),
      oldRecipe({ name: 'Pie', createdAt: day(1) }),
      oldRecipe({ name: 'Pie!', createdAt: day(3) }),
    ])

    const slugs = (report: Report) =>
      Object.fromEntries(report.recipes.map((recipe) => [String(recipe._id), recipe.slug]))
    const dry = await migrateDb(db, false)
    const applied = await migrateDb(db, true)

    expect(slugs(applied)).toEqual(slugs(dry))
  })

  it('gives a new old-shape recipe -2 when an already-migrated recipe holds the slug', async () => {
    const first = oldRecipe({ name: 'Beef Stew', createdAt: day(10) })
    const db = await freshDb([first])
    await migrateDb(db, true)

    // Added after the first migration, but created earlier: the migrated
    // recipe keeps its slug regardless.
    const late = oldRecipe({ name: 'Beef Stew', createdAt: day(1) })
    await db.collection('recipes').insertOne(late)

    const report = await migrateDb(db, true)

    expect(entry(report, first._id)).toMatchObject({ outcome: 'skip', slug: 'beef-stew' })
    expect(entry(report, late._id)).toMatchObject({ outcome: 'convert', slug: 'beef-stew-2' })
    const after = await stored(db)
    expect(after.find((d) => d._id.equals(first._id))!.slug).toBe('beef-stew')
    expect(after.find((d) => d._id.equals(late._id))!.slug).toBe('beef-stew-2')
  })
})

describe('migrate CLI', () => {
  const cli = 'scripts/migrate-recipes-v2/index.ts'

  // Only PATH and NODE_ENV are passed through, so the child never sees a real MONGODB_URI.
  const childEnv = (extra: Record<string, string>) =>
    ({ PATH: process.env.PATH, NODE_ENV: 'test', ...extra }) as NodeJS.ProcessEnv

  it('fails without MONGODB_URI', async () => {
    // No MONGODB_URI in the child env, so it can't reach any database.
    const env = childEnv({})
    const result = run(process.execPath, [cli, '--admin-user-id', adminId.toHexString()], {
      cwd: repoRoot,
      env,
    })
    await expect(result).rejects.toMatchObject({ stderr: expect.stringContaining('MONGODB_URI') })
  })

  it('prints the host and database, and exits 1 when a recipe has a problem', async () => {
    const db = await freshDb([oldRecipe({ name: 'Odd One', rating: 5 })])
    const uri = mongo.getUri(db.databaseName)
    const env = childEnv({ MONGODB_URI: uri })

    const error = await run(process.execPath, [cli, '--admin-user-id', adminId.toHexString()], {
      cwd: repoRoot,
      env,
    }).then(
      () => null,
      (err: { code: number; stdout: string }) => err
    )

    expect(error?.code).toBe(1)
    expect(error?.stdout).toContain(new URL(uri).host)
    expect(error?.stdout).toContain(db.databaseName)
  })
})
