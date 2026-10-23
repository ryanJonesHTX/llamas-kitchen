import mongoose from 'mongoose'
import Recipe from '../../models/Recipe.js'
import { E2E_MONGODB_DB, E2E_MONGODB_PORT, seedRecipes } from './fixtures.ts'

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

// Replaces every recipe with the seed fixtures and signs everyone out.
export async function reseed() {
  const connection = await connect()
  await Recipe.deleteMany({})
  await Recipe.insertMany(seedRecipes)
  await connection.collection(USERS_COLLECTION).deleteMany({})
  await connection.collection(SESSIONS_COLLECTION).deleteMany({})
}

export async function disconnect() {
  await mongoose.disconnect()
}
