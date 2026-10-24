// Copies recipe images stored outside UPLOAD_FOLDER into it and points each
// recipe at its copy. Dry run unless --apply.
//   MONGODB_URI=... CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... \
//     node scripts/migrate-image-folder/index.ts [--apply]
// Reads only those four from the environment; no .env file is loaded.
// Copies, never renames: dev and prod reference the same Cloudinary assets, so
// the old ones stay until both databases are migrated and are deleted by hand.
// Cloudinary response bodies are never logged, since they can echo the signature.
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { requireEnv } from '../../lib/env.ts'
import { Recipe, type RecipeRecord } from '../../lib/recipes/model.ts'
import { signUploadParams } from '../../lib/uploadSignature.ts'
import { IMAGE_PUBLIC_ID_PATTERN } from '../../lib/uploads.ts'
import { copyParams, originalUrl, targetPublicId } from './copy.ts'

const uri = requireEnv('MONGODB_URI')
const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME')
const apiKey = requireEnv('CLOUDINARY_API_KEY')
const apiSecret = requireEnv('CLOUDINARY_API_SECRET')

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })

const UPLOAD_TIMEOUT_MS = 60_000

// Copies one image; true when Cloudinary already had the target.
async function copyImage(from: string, to: string): Promise<boolean> {
  const params = copyParams(from, Math.floor(Date.now() / 1000))
  const body = new FormData()
  body.set('file', originalUrl(cloudName, from))
  body.set('api_key', apiKey)
  for (const [name, value] of Object.entries(params)) body.set(name, String(value))
  body.set('signature', signUploadParams(params, apiSecret))

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Cloudinary upload failed with status ${response.status}`)
  const { public_id: publicId, existing } = (await response.json()) as { public_id: unknown; existing?: unknown }
  if (publicId !== to) throw new Error(`Cloudinary stored the copy as ${JSON.stringify(publicId)}`)
  return existing === true
}

// autoCreate off: pointed at the wrong database, it must not create an empty recipes collection.
await mongoose.connect(uri, { autoCreate: false })
try {
  if ((await Recipe.estimatedDocumentCount()) === 0) {
    throw new Error('No recipes found. Is MONGODB_URI pointing at the right database?')
  }
  const recipes = await Recipe.find({ imagePublicId: { $exists: true } }).lean<RecipeRecord[]>()
  const moves = recipes
    .filter((recipe) => !IMAGE_PUBLIC_ID_PATTERN.test(recipe.imagePublicId!))
    .map(({ _id, slug, imagePublicId }) => ({ _id, slug, from: imagePublicId!, to: targetPublicId(imagePublicId!) }))
  if (new Set(moves.map((move) => move.to)).size !== moves.length) {
    throw new Error('Two images would be copied to the same public ID. Nothing was written.')
  }

  console.log(values.apply ? 'Mode: apply' : 'Mode: dry run (pass --apply to write)')
  for (const { _id, slug, from, to } of moves) console.log(`${_id}  ${slug}  ${from} -> ${to}`)

  if (!values.apply) {
    console.log(`Dry run: ${moves.length} image(s) to copy. Nothing was written.`)
  } else {
    // Stops at the first failure; recipes before it are done, and a re-run picks up the rest.
    const totals = { copied: 0, alreadyPresent: 0, updated: 0 }
    for (const { _id, slug, from, to } of moves) {
      if (await copyImage(from, to)) totals.alreadyPresent++
      else totals.copied++
      // Raw driver: no validators (older recipes may break newer limits) and no
      // updatedAt bump. Conditional on the old ID, so a re-run is safe.
      const { modifiedCount } = await Recipe.collection.updateOne({ _id, imagePublicId: from }, { $set: { imagePublicId: to } })
      if (modifiedCount !== 1) throw new Error(`${_id} ${slug} no longer has the image ID ${from}`)
      totals.updated++
    }
    console.log(`Copied: ${totals.copied}, already present: ${totals.alreadyPresent}, updated: ${totals.updated}`)
  }
} finally {
  await mongoose.disconnect()
}
