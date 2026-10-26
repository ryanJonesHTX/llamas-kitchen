import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import mongoose from 'mongoose'
import { MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Recipe } from '../../lib/recipes/model'
import { recipeDoc } from '../fixtures/recipes'

// scripts/sync-indexes.ts syncs the Recipe indexes with the model (autoIndex
// is off) against an explicit MONGODB_URI. Runs it as a child process, the way it
// is run by hand, against an in-memory MongoDB.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const run = promisify(execFile)
const script = 'scripts/sync-indexes.ts'

// Only PATH and NODE_ENV are passed through, so the child never sees a real MONGODB_URI.
const childEnv = (extra: Record<string, string>) =>
  ({ PATH: process.env.PATH, NODE_ENV: 'test', ...extra }) as NodeJS.ProcessEnv

let mongo: MongoMemoryServer
let client: MongoClient

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  client = await new MongoClient(mongo.getUri()).connect()
})

afterAll(async () => {
  await client?.close()
  await mongoose.disconnect()
  await mongo?.stop()
})

async function recipeIndexes(dbName: string) {
  const indexes = await client.db(dbName).collection('recipes').indexes()
  return indexes.map(({ key, unique, weights }) => ({
    key,
    ...(unique !== undefined && { unique }),
    ...(weights !== undefined && { weights }),
  }))
}

// The indexes the model declares, plus _id.
const declared = [
  { key: { _id: 1 } },
  { key: { slug: 1 }, unique: true },
  { key: { status: 1, publishedAt: -1, _id: -1 } },
  { key: { tags: 1, status: 1, publishedAt: -1, _id: -1 } },
  { key: { status: 1, createdAt: 1 } },
  { key: { submittedBy: 1, createdAt: -1 } },
]

const syncIndexes = (dbName: string) =>
  run(process.execPath, [script], { cwd: repoRoot, env: childEnv({ MONGODB_URI: mongo.getUri(dbName) }) })

describe('sync-indexes', () => {
  it('creates no indexes just by using the model', async () => {
    const dbName = 'sync-indexes-model-only'
    await mongoose.connect(mongo.getUri(dbName))
    await Recipe.init()
    await Recipe.create(recipeDoc())
    await mongoose.disconnect()

    expect(await recipeIndexes(dbName)).toEqual([{ key: { _id: 1 } }])
  })

  it('creates every index the model declares', async () => {
    const dbName = 'sync-indexes-run'
    const { stdout } = await syncIndexes(dbName)

    expect(await recipeIndexes(dbName)).toEqual(expect.arrayContaining(declared))
    expect(await recipeIndexes(dbName)).toHaveLength(declared.length)
    expect(stdout).toContain('Dropped none.')
  })

  it('drops an index the model no longer declares, such as the old text index', async () => {
    const dbName = 'sync-indexes-drop'
    await client.db(dbName).collection('recipes').createIndex(
      { name: 'text', 'ingredients.item': 'text', tags: 'text' },
      { name: 'old_text', weights: { name: 10, 'ingredients.item': 5, tags: 3 } }
    )
    expect(await recipeIndexes(dbName)).toContainEqual(expect.objectContaining({ key: { _fts: 'text', _ftsx: 1 } }))

    const { stdout } = await syncIndexes(dbName)

    expect(await recipeIndexes(dbName)).toEqual(expect.arrayContaining(declared))
    expect(await recipeIndexes(dbName)).toHaveLength(declared.length)
    expect(stdout).toContain('Dropped: old_text')
  })

  it('is idempotent', async () => {
    const dbName = 'sync-indexes-twice'
    await syncIndexes(dbName)
    const { stdout } = await syncIndexes(dbName)

    expect(await recipeIndexes(dbName)).toHaveLength(declared.length)
    expect(stdout).toContain('Dropped none.')
  })

  it('fails without MONGODB_URI', async () => {
    const result = run(process.execPath, [script], { cwd: repoRoot, env: childEnv({}) })
    await expect(result).rejects.toMatchObject({ stderr: expect.stringContaining('MONGODB_URI') })
  })
})
