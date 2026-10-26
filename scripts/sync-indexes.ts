// Syncs the Recipe indexes with the model: creates the ones it declares and
// drops any it doesn't (_id is kept). The model never builds them itself
// (autoIndex is off).
//   MONGODB_URI=... node scripts/sync-indexes.ts
// Reads only MONGODB_URI from the environment; no .env file is loaded.
// Run after migrate:recipes-v2: the unique slug index needs every recipe to have its slug.
import mongoose from 'mongoose'
import { Recipe } from '../lib/recipes/model.ts'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set. Pass it explicitly for the cluster to index.')

await mongoose.connect(uri)
try {
  const dropped = await Recipe.syncIndexes()
  const collection = Recipe.collection.collectionName
  console.log(`Synced the indexes on ${collection}.`)
  console.log(dropped.length > 0 ? `Dropped: ${dropped.join(', ')}` : 'Dropped none.')
} finally {
  await mongoose.disconnect()
}
