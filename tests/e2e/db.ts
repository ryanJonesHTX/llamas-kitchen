import mongoose from 'mongoose'
import { Recipe, type RecipeRecord } from '../../lib/recipes/model.ts'
import { E2E_MONGODB_DB, E2E_MONGODB_PORT, seedRecipes, type SeedRecipe } from './fixtures.ts'
import { resetCloudinaryUploads } from './uploads.ts'

// Hardcoded to the local in-memory server; never read from the environment.
export const E2E_MONGODB_URI = `mongodb://127.0.0.1:${E2E_MONGODB_PORT}/${E2E_MONGODB_DB}`

// Collections written by @auth/mongodb-adapter (its default names).
export const USERS_COLLECTION = 'users'
export const SESSIONS_COLLECTION = 'sessions'

// Stored recipes always carry updatedAt (the queue's review token); a seed
// recipe's is its createdAt.
const stored = (recipes: SeedRecipe[]) => recipes.map((recipe) => ({ updatedAt: recipe.createdAt, ...recipe }))

export async function connect() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(E2E_MONGODB_URI)
  }
  return mongoose.connection
}

// Replaces every recipe with the seed fixtures, builds the recipe indexes (as
// scripts/sync-indexes.ts does, so the unique slug index exists), signs
// everyone out and clears the fake Cloudinary's upload and destroy logs.
export async function reseed() {
  const connection = await connect()
  await Recipe.deleteMany({})
  // The seed sets its own createdAt; timestamps would overwrite it.
  await Recipe.insertMany(stored(seedRecipes), { timestamps: false })
  await Recipe.createIndexes()
  await connection.collection(USERS_COLLECTION).deleteMany({})
  await connection.collection(SESSIONS_COLLECTION).deleteMany({})
  resetCloudinaryUploads()
}

// Adds recipes on top of the seed, for tests that need more than it holds.
export async function insertRecipes(recipes: SeedRecipe[]): Promise<void> {
  await connect()
  await Recipe.insertMany(stored(recipes), { timestamps: false })
}

// Leaves no recipes at all, for empty-state tests.
export async function deleteAllRecipes(): Promise<void> {
  await connect()
  await Recipe.deleteMany({})
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
