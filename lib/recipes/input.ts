import { z } from 'zod'
import {
  MAX_INGREDIENT_ITEM_LENGTH,
  MAX_INGREDIENT_UNIT_LENGTH,
  MAX_RECIPE_CREDIT_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_NAME_LENGTH,
  MAX_RECIPE_NOTES_LENGTH,
  MAX_RECIPE_STEP_LENGTH,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TAG_LENGTH,
  MAX_RECIPE_TAGS,
} from '../constants'
import { canSlugify } from '../slugify'
import { IMAGE_PUBLIC_ID_PATTERN } from '../uploads'
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

const atMost = (max: number) => `must be at most ${max} characters`

// What a person or the import parser supplies. The server sets submittedBy,
// status, rejectionReason, publishedAt and slug. Unknown keys are stripped, so
// the parse output is the whitelist of fields input may write. A list entry's
// message names its list, because the form shows it under the whole list.
export const recipeInputSchema = z.object({
  // Every recipe needs a slug made from its name.
  name: requiredText.max(MAX_RECIPE_NAME_LENGTH, atMost(MAX_RECIPE_NAME_LENGTH)).refine(canSlugify, 'needs at least one letter or number'),
  description: requiredText.max(MAX_RECIPE_DESCRIPTION_LENGTH, atMost(MAX_RECIPE_DESCRIPTION_LENGTH)),
  ingredients: z
    .array(
      z.object({
        quantity: z.number().positive().nullable(),
        unit: z
          .string()
          .trim()
          .max(MAX_INGREDIENT_UNIT_LENGTH, `each ingredient unit must be at most ${MAX_INGREDIENT_UNIT_LENGTH} characters`)
          .nullable(),
        item: requiredText.max(
          MAX_INGREDIENT_ITEM_LENGTH,
          `each ingredient item must be at most ${MAX_INGREDIENT_ITEM_LENGTH} characters`
        ),
      })
    )
    .min(1)
    .max(MAX_RECIPE_INGREDIENTS, `at most ${MAX_RECIPE_INGREDIENTS} ingredients`),
  steps: z
    .array(requiredText.max(MAX_RECIPE_STEP_LENGTH, `each step must be at most ${MAX_RECIPE_STEP_LENGTH} characters`))
    .min(1)
    .max(MAX_RECIPE_STEPS, `at most ${MAX_RECIPE_STEPS} steps`),
  servings: wholeNumber(1),
  prepTime: wholeNumber(0),
  cookTime: wholeNumber(0),
  // De-duplicated after normalizing, keeping first-seen order; the limit counts distinct tags.
  tags: z
    .array(
      z.string().trim().toLowerCase().min(1).max(MAX_RECIPE_TAG_LENGTH, `each tag must be at most ${MAX_RECIPE_TAG_LENGTH} characters`)
    )
    .transform((tags) => [...new Set(tags)])
    .refine((tags) => tags.length <= MAX_RECIPE_TAGS, `at most ${MAX_RECIPE_TAGS} tags`),
  imagePublicId: optionalField(z.string().trim().regex(IMAGE_PUBLIC_ID_PATTERN)),
  notes: optionalField(z.string().trim().max(MAX_RECIPE_NOTES_LENGTH, atMost(MAX_RECIPE_NOTES_LENGTH))),
  credit: optionalField(z.string().trim().max(MAX_RECIPE_CREDIT_LENGTH, atMost(MAX_RECIPE_CREDIT_LENGTH))),
  sourceUrl: optionalField(sourceUrlSchema),
})

export type RecipeInput = z.infer<typeof recipeInputSchema>
