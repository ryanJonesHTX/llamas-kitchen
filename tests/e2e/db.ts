import mongoose from 'mongoose'
import { Recipe, type RecipeRecord } from '../../lib/recipes/model.ts'
import { E2E_MONGODB_DB, E2E_MONGODB_PORT, seedRecipes } from './fixtures.ts'
import { resetCloudinaryUploads } from './uploads.ts'

// Hardcoded to the local in-memory server; never read from the environment.
export const E2E_MONGODB_URI = `mongodb://127.0.0.1:${E2E_MONGODB_PORT}/${E2E_MONGODB_DB}`

// Collections written by @auth/mongodb-adapter (its default names).
export const USERS_COLLECTION = 'users'
export const SESSIONS_COLLECTION = 'sessions'

export async function connect() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(E2E_MONGODB_URI)
  }
  return mongoose.connection
}

// Replaces every recipe with the seed fixtures, builds the recipe indexes (as
// scripts/create-indexes.ts does, so the unique slug index exists), signs
// everyone out and clears the fake Cloudinary's upload log.
export async function reseed() {
  const connection = await connect()
  await Recipe.deleteMany({})
  // The seed sets its own createdAt; timestamps would overwrite it.
  await Recipe.insertMany(seedRecipes, { timestamps: false })
  await Recipe.createIndexes()
  await connection.collection(USERS_COLLECTION).deleteMany({})
  await connection.collection(SESSIONS_COLLECTION).deleteMany({})
  resetCloudinaryUploads()
}

export async function findRecipe(filter: Record<string, unknown>): Promise<RecipeRecord | null> {
  await connect()
  return Recipe.findOne(filter).lean<RecipeRecord>()
}

export async function countRecipes(): Promise<number> {
  await connect()
  return Recipe.countDocuments()
}

// Deletes every session, so signed-in browsers are signed out on their next request.
export async function deleteSessions(): Promise<void> {
  const connection = await connect()
  await connection.collection(SESSIONS_COLLECTION).deleteMany({})
}

export async function disconnect() {
  await mongoose.disconnect()
}
