// The recipe model from .claude/SCHEMA-PROPOSAL.md. Indexes are built by
// scripts/create-indexes.ts, never automatically. Imported by that script
// under Node type stripping, so imports carry .ts extensions.
import mongoose, { type Types } from 'mongoose'
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
  MAX_REJECTION_REASON_LENGTH,
} from '../constants.ts'
import type { Ingredient } from '../ingredients.ts'
import { SLUG_PATTERN } from '../slugify.ts'
import { sourceUrlSchema } from './sourceUrl.ts'

const { Schema } = mongoose

export const RECIPE_STATUSES = ['pending', 'published', 'rejected'] as const

export type RecipeStatus = (typeof RECIPE_STATUSES)[number]

// A stored recipe, as returned by lean queries.
export type RecipeRecord = {
  _id: Types.ObjectId
  name: string
  slug: string
  description: string
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  prepTime: number
  cookTime: number
  tags: string[]
  imagePublicId?: string
  notes?: string
  credit?: string
  sourceUrl?: string
  submittedBy: Types.ObjectId
  status: RecipeStatus
  rejectionReason?: string
  publishedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const optionalText = { type: String, trim: true, minlength: 1 }

const minutes = {
  type: Number,
  required: true,
  min: 0,
  validate: { validator: Number.isInteger, message: 'must be a whole number of minutes' },
}

// A missing quantity or unit is stored as null, meaning "don't scale" or "no unit".
const ingredientSchema = new Schema<Ingredient>(
  {
    quantity: {
      type: Number,
      default: null,
      validate: { validator: (quantity: number | null) => quantity === null || quantity > 0, message: 'must be > 0' },
    },
    unit: { type: String, trim: true, default: null, maxlength: MAX_INGREDIENT_UNIT_LENGTH },
    item: { type: String, trim: true, required: true, maxlength: MAX_INGREDIENT_ITEM_LENGTH },
  },
  { _id: false }
)

const recipeSchema = new Schema<RecipeRecord>(
  {
    name: { type: String, trim: true, required: true, maxlength: MAX_RECIPE_NAME_LENGTH },
    slug: { type: String, required: true, match: SLUG_PATTERN },
    description: { type: String, trim: true, required: true, maxlength: MAX_RECIPE_DESCRIPTION_LENGTH },
    ingredients: {
      type: [ingredientSchema],
      validate: [
        { validator: (ingredients: unknown[]) => ingredients.length > 0, message: 'needs at least one' },
        {
          validator: (ingredients: unknown[]) => ingredients.length <= MAX_RECIPE_INGREDIENTS,
          message: `at most ${MAX_RECIPE_INGREDIENTS} ingredients`,
        },
      ],
    },
    steps: {
      type: [{ type: String, trim: true, required: true, maxlength: MAX_RECIPE_STEP_LENGTH }],
      validate: [
        { validator: (steps: unknown[]) => steps.length > 0, message: 'needs at least one' },
        { validator: (steps: unknown[]) => steps.length <= MAX_RECIPE_STEPS, message: `at most ${MAX_RECIPE_STEPS} steps` },
      ],
    },
    servings: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'must be a whole number' },
    },
    prepTime: minutes,
    cookTime: minutes,
    // Checked after trim and lowercase have normalized each tag.
    tags: {
      type: [{ type: String, trim: true, lowercase: true, required: true, maxlength: MAX_RECIPE_TAG_LENGTH }],
      validate: [
        { validator: (tags: string[]) => tags.length <= MAX_RECIPE_TAGS, message: `at most ${MAX_RECIPE_TAGS} tags` },
        { validator: (tags: string[]) => new Set(tags).size === tags.length, message: 'tags must be unique' },
      ],
    },
    imagePublicId: optionalText,
    notes: { ...optionalText, maxlength: MAX_RECIPE_NOTES_LENGTH },
    credit: { ...optionalText, maxlength: MAX_RECIPE_CREDIT_LENGTH },
    sourceUrl: {
      type: String,
      validate: { validator: (url: string) => sourceUrlSchema.safeParse(url).success, message: 'must be an http or https URL' },
    },
    submittedBy: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, required: true, enum: RECIPE_STATUSES },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: MAX_REJECTION_REASON_LENGTH,
      required(this: RecipeRecord) {
        return this.status === 'rejected'
      },
      validate: {
        validator() {
          return this.get('status') === 'rejected'
        },
        message: 'only allowed when status is rejected',
      },
    },
    publishedAt: {
      type: Date,
      required(this: RecipeRecord) {
        return this.status === 'published'
      },
      validate: {
        validator() {
          return this.get('status') === 'published'
        },
        message: 'only allowed when status is published',
      },
    },
  },
  { timestamps: true, autoIndex: false }
)

recipeSchema.index({ slug: 1 }, { unique: true })
// Newest published first; (publishedAt, _id) is the list cursor.
recipeSchema.index({ status: 1, publishedAt: -1, _id: -1 })
recipeSchema.index({ tags: 1, status: 1, publishedAt: -1, _id: -1 })
// Moderation queue, oldest first.
recipeSchema.index({ status: 1, createdAt: 1 })
recipeSchema.index({ submittedBy: 1, createdAt: -1 })
// Search filter. A text index can't be changed once built, so the weights are final.
recipeSchema.index(
  { name: 'text', 'ingredients.item': 'text', tags: 'text' },
  { weights: { name: 10, 'ingredients.item': 5, tags: 3 } }
)

export const Recipe =
  (mongoose.models.Recipe as mongoose.Model<RecipeRecord> | undefined) ??
  mongoose.model<RecipeRecord>('Recipe', recipeSchema, 'recipes')
