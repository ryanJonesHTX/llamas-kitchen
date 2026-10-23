import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import mongoose from 'mongoose'
import { MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Recipe } from '../../lib/recipes/model'
import { recipeDoc } from '../fixtures/recipes'

// scripts/create-indexes.ts builds the Recipe indexes (autoIndex is off)
// against an explicit MONGODB_URI. Runs it as a child process, the way it
// is run by hand, against an in-memory MongoDB.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const run = promisify(execFile)
const script = 'scripts/create-indexes.ts'

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

describe('create-indexes', () => {
  it('creates no indexes just by using the model', async () => {
    const dbName = 'create-indexes-model-only'
    await mongoose.connect(mongo.getUri(dbName))
    await Recipe.init()
    await Recipe.create(recipeDoc())
    await mongoose.disconnect()

    expect(await recipeIndexes(dbName)).toEqual([{ key: { _id: 1 } }])
  })

  it('creates every index from the proposal', async () => {
    const dbName = 'create-indexes-run'
    await run(process.execPath, [script], { cwd: repoRoot, env: childEnv({ MONGODB_URI: mongo.getUri(dbName) }) })

    const indexes = await recipeIndexes(dbName)
    expect(indexes).toHaveLength(7)
    expect(indexes).toEqual(
      expect.arrayContaining([
        { key: { _id: 1 } },
        { key: { slug: 1 }, unique: true },
        { key: { status: 1, publishedAt: -1, _id: -1 } },
        { key: { tags: 1, status: 1, publishedAt: -1, _id: -1 } },
        { key: { status: 1, createdAt: 1 } },
        { key: { submittedBy: 1, createdAt: -1 } },
        { key: { _fts: 'text', _ftsx: 1 }, weights: { name: 10, 'ingredients.item': 5, tags: 3 } },
      ])
    )
  })

  it('fails without MONGODB_URI', async () => {
    const result = run(process.execPath, [script], { cwd: repoRoot, env: childEnv({}) })
    await expect(result).rejects.toMatchObject({ stderr: expect.stringContaining('MONGODB_URI') })
  })
})
