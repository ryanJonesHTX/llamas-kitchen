// Read-only report on stored recipes, run before tightening the input schema:
// - recipes whose imagePublicId is outside the upload folder's pattern
//   (the v2 migration copied old cloudinaryId values unchanged);
// - the longest value and largest count per text field, to check the limits fit;
// - recipes with an ingredient quantity above MAX_INGREDIENT_QUANTITY.
//   MONGODB_URI=... node scripts/check-recipe-data.ts
// Reads only MONGODB_URI from the environment; no .env file is loaded.
import mongoose from 'mongoose'
import { MAX_INGREDIENT_QUANTITY } from '../lib/constants.ts'
import { Recipe, type RecipeRecord } from '../lib/recipes/model.ts'
import { IMAGE_PUBLIC_ID_PATTERN } from '../lib/uploads.ts'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set. Pass it explicitly for the cluster to check.')

const longest = (values: (string | null | undefined)[]) => Math.max(0, ...values.map((value) => value?.length ?? 0))

// autoCreate off: pointed at the wrong database, it must not create an empty recipes collection.
await mongoose.connect(uri, { autoCreate: false })
try {
  const recipes = await Recipe.find().lean<RecipeRecord[]>()
  if (recipes.length === 0) throw new Error('No recipes found. Is MONGODB_URI pointing at the right database?')

  const withImage = recipes.filter((recipe) => recipe.imagePublicId)
  const mismatched = withImage.filter((recipe) => !IMAGE_PUBLIC_ID_PATTERN.test(recipe.imagePublicId!))
  for (const { _id, slug, status, imagePublicId } of mismatched) {
    console.log(`${_id}  ${slug}  ${status}  ${JSON.stringify(imagePublicId)}`)
  }
  console.log(`Recipes: ${recipes.length}`)
  console.log(`With an image: ${withImage.length}`)
  console.log(`Image ID not matching ${IMAGE_PUBLIC_ID_PATTERN}: ${mismatched.length}`)

  console.log('Longest value (characters):')
  console.table({
    description: longest(recipes.map((recipe) => recipe.description)),
    notes: longest(recipes.map((recipe) => recipe.notes)),
    credit: longest(recipes.map((recipe) => recipe.credit)),
    step: longest(recipes.flatMap((recipe) => recipe.steps)),
    'ingredient item': longest(recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.item))),
    'ingredient unit': longest(recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.unit))),
    tag: longest(recipes.flatMap((recipe) => recipe.tags)),
  })
  console.log('Largest count per recipe:')
  console.table({
    steps: Math.max(0, ...recipes.map((recipe) => recipe.steps.length)),
    ingredients: Math.max(0, ...recipes.map((recipe) => recipe.ingredients.length)),
  })

  const tooLarge = recipes.flatMap(({ _id, slug, status, ingredients }) =>
    ingredients
      .filter((ingredient) => (ingredient.quantity ?? 0) > MAX_INGREDIENT_QUANTITY)
      .map((ingredient) => ({ _id, slug, status, ingredient }))
  )
  for (const { _id, slug, status, ingredient } of tooLarge) {
    console.log(`${_id}  ${slug}  ${status}  ${JSON.stringify(ingredient)}`)
  }
  console.log(`Ingredient quantities above ${MAX_INGREDIENT_QUANTITY}: ${tooLarge.length}`)
} finally {
  await mongoose.disconnect()
}
