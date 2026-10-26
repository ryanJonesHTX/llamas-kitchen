// Syncs the Recipe indexes with the model: creates the ones it declares and
// drops any it doesn't (_id is kept). The model never builds them itself
// (autoIndex is off). Dry run unless --apply: prints what would be dropped
// and created.
//   MONGODB_URI=... node scripts/sync-indexes.ts [--apply]
// Reads only MONGODB_URI from the environment; no .env file is loaded.
// Run after migrate:recipes-v2: the unique slug index needs every recipe to have its slug.
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { Recipe } from '../lib/recipes/model.ts'
import { hostsOf } from './hostsOf.ts'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set. Pass it explicitly for the cluster to index.')

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })

const list = (items: string[]) => (items.length > 0 ? items.join(', ') : 'none')

// autoCreate off: a dry run must not create the recipes collection.
await mongoose.connect(uri, { autoCreate: false })
try {
  console.log(`Target: ${hostsOf(uri)}, database ${mongoose.connection.name}`)
  console.log(values.apply ? 'Mode: apply' : 'Mode: dry run (pass --apply to write)')

  const { toDrop, toCreate } = await Recipe.diffIndexes()
  console.log(`Would drop: ${list(toDrop)}`)
  console.log(`Would create: ${list(toCreate.map((spec) => JSON.stringify(spec)))}`)

  if (values.apply) {
    const dropped = await Recipe.syncIndexes()
    console.log(`Synced the indexes on ${Recipe.collection.collectionName}.`)
    console.log(dropped.length > 0 ? `Dropped: ${dropped.join(', ')}` : 'Dropped none.')
  } else {
    console.log('Dry run: nothing was written.')
  }
} finally {
  await mongoose.disconnect()
}
