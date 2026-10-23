import mongoose from 'mongoose'
import Recipe from '../../models/Recipe.js'
import { E2E_MONGODB_DB, E2E_MONGODB_PORT, seedRecipes } from './fixtures.ts'

// Hardcoded to the local in-memory server; never read from the environment.
export const E2E_MONGODB_URI = `mongodb://127.0.0.1:${E2E_MONGODB_PORT}/${E2E_MONGODB_DB}`

// Replaces every recipe with the seed fixtures.
export async function reseed() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(E2E_MONGODB_URI)
  }
  await Recipe.deleteMany({})
  await Recipe.insertMany(seedRecipes)
}

export async function disconnect() {
  await mongoose.disconnect()
}
