import { z } from 'zod'

export const recipeCategories = [
  'Chicken',
  'Beef',
  'Pork',
  'Seafood',
  'Vegetarian',
  'Pasta',
  'Pizza',
  'Holiday',
  'Dessert',
  'Sides',
] as const

// The form sends '' for blank optional fields; treat blank-after-trim as absent.
function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

const requiredText = z.string().trim().min(1)
const minutes = z.coerce.number().int().min(0)

// Unknown keys (_id, createdAt, __v, ...) are stripped, so the parse output
// is the whitelist of fields that may be written to the database.
export const recipeInputSchema = z.object({
  name: requiredText,
  description: requiredText,
  directions: requiredText,
  ingredients: z
    .array(z.object({ id: z.number(), ingredient: requiredText }))
    .min(1),
  prepTime: minutes,
  cookTime: minutes,
  photo: optionalField(z.url()),
  cloudinaryId: optionalField(z.string()),
  category: optionalField(z.enum(recipeCategories)),
  submittedBy: optionalField(z.string().trim()),
  notes: optionalField(z.string().trim()),
})

export type RecipeInput = z.infer<typeof recipeInputSchema>
