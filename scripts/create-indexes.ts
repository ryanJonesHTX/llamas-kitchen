// Builds the Recipe indexes; the model never builds them itself (autoIndex is off).
//   MONGODB_URI=... node scripts/create-indexes.ts
// Reads only MONGODB_URI from the environment; no .env file is loaded.
// Run after migrate:recipes-v2: the unique slug index needs every recipe to have its slug.
import mongoose from 'mongoose'
import { Recipe } from '../lib/recipes/model.ts'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set. Pass it explicitly for the cluster to index.')

await mongoose.connect(uri)
try {
  await Recipe.createIndexes()
  console.log(`Created the indexes on ${Recipe.collection.collectionName}.`)
} finally {
  await mongoose.disconnect()
}
