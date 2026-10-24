import { z } from 'zod'
import { MAX_RECIPE_NAME_LENGTH, MAX_RECIPE_TAGS } from '../constants'
import { canSlugify } from '../slugify'
import { sourceUrlSchema } from './sourceUrl'

// Forms send '' for blank fields; blank-after-trim means absent.
function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional())
}

// Coerced from form strings; a blank one is missing, not 0.
function wholeNumber(min: number) {
  return z.preprocess(blankToUndefined, z.coerce.number().int().min(min))
}

const requiredText = z.string().trim().min(1)

// What a person or the import parser supplies. The server sets submittedBy,
// status, rejectionReason, publishedAt and slug. Unknown keys are stripped, so
// the parse output is the whitelist of fields input may write.
export const recipeInputSchema = z.object({
  // Every recipe needs a slug made from its name.
  name: requiredText.max(MAX_RECIPE_NAME_LENGTH).refine(canSlugify, 'needs at least one letter or number'),
  description: requiredText,
  ingredients: z
    .array(
      z.object({
        quantity: z.number().positive().nullable(),
        unit: z.string().trim().nullable(),
        item: requiredText,
      })
    )
    .min(1),
  steps: z.array(requiredText).min(1),
  servings: wholeNumber(1),
  prepTime: wholeNumber(0),
  cookTime: wholeNumber(0),
  // De-duplicated after normalizing, keeping first-seen order; the limit counts distinct tags.
  tags: z
    .array(z.string().trim().toLowerCase().min(1))
    .transform((tags) => [...new Set(tags)])
    .refine((tags) => tags.length <= MAX_RECIPE_TAGS, `at most ${MAX_RECIPE_TAGS} tags`),
  imagePublicId: optionalField(z.string().trim()),
  notes: optionalField(z.string().trim()),
  credit: optionalField(z.string().trim()),
  sourceUrl: optionalField(sourceUrlSchema),
})

export type RecipeInput = z.infer<typeof recipeInputSchema>
