'use client'

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircleIcon, PhotoIcon, PlusIcon } from '@heroicons/react/20/solid'
import {
  createRecipe,
  updateRecipe,
  uploadRecipeImage,
  type SaveResult,
  type UploadResult,
} from '../app/recipes/actions'
import { flashCookie, type FlashKey } from '../lib/flash'
import { parseIngredient } from '../lib/ingredients'
import { recipeInputSchema } from '../lib/recipes/input'
import type { RecipeStatus } from '../lib/recipes/model'
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } from '../lib/uploads'
import RecipeStatusBanner from './RecipeStatusBanner'
import { SortableIngredient, SortableIngredients } from './SortableIngredients'

// The trimmed, non-blank pieces of `text`.
function nonBlankParts(text: string, separator: string): string[] {
  return text
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean)
}

// recipeInputSchema over the form's text fields: one ingredient per line
// (blank lines skipped), one step per line, comma-separated tags. Its output
// is the action input. The server checks the slug, so here it's any string.
const recipeFormSchema = recipeInputSchema.extend({
  ingredients: z
    .array(z.object({ line: z.string() }))
    .transform((rows) => rows.map((row) => row.line).filter((line) => line.trim()).map(parseIngredient))
    .pipe(recipeInputSchema.shape.ingredients),
  steps: z
    .string()
    .transform((text) => nonBlankParts(text, '\n'))
    .pipe(recipeInputSchema.shape.steps),
  tags: z
    .string()
    .transform((text) => nonBlankParts(text, ','))
    .pipe(recipeInputSchema.shape.tags),
  slug: z.string().optional(),
})

export type RecipeFormValues = z.input<typeof recipeFormSchema>

type RecipeFormOutput = z.output<typeof recipeFormSchema>

const EMPTY_VALUES: RecipeFormValues = {
  name: '',
  description: '',
  ingredients: [{ line: '' }],
  steps: '',
  tags: '',
  servings: '',
  prepTime: '',
  cookTime: '',
  notes: '',
  credit: '',
}

// Fields with an input, in form order, for moving focus to the first invalid one.
const FIELD_ORDER = [
  'name',
  'slug',
  'description',
  'tags',
  'ingredients',
  'steps',
  'prepTime',
  'cookTime',
  'servings',
  'notes',
  'credit',
] as const

// Fields with no input of their own; an error on one goes to the form's alert.
const NO_INPUT_ERRORS = {
  imagePublicId: "This recipe's image is invalid. Upload the image again.",
  sourceUrl: "This recipe's source link is invalid, and it can't be changed here.",
} as const

const SAVE_FAILED = 'Something went wrong and the recipe was not saved. Reload the page and try again.'
const UPLOAD_FAILED = 'Something went wrong and the image was not uploaded. Reload the page and try again.'

// Input colors and focus rings come from the forms-plugin overrides in styles/globals.css.
const LABEL = 'block text-sm font-medium text-text'
const INPUT = 'block min-h-11 w-full min-w-0 rounded-lg shadow-xs sm:text-sm'
const HELP = 'mt-2 text-sm text-muted'
const ERROR = 'mt-2 text-sm text-danger'
const CARD = 'rounded-xl border border-border bg-surface p-6'
const CARD_HEADING = 'font-display text-xl text-text text-balance'
const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center gap-x-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft'

// Marks an input invalid and points it at its error message.
function errorProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
}

// A list field's first message, wherever it was filed: on the list itself
// (setError), under its root (the resolver, for a field array), or under an
// entry's index (an over-long step, say), which has no input of its own.
function listError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  if ('message' in error && typeof error.message === 'string') return error.message
  for (const [key, value] of Object.entries(error)) {
    const message = key === 'ref' ? undefined : listError(value)
    if (message) return message
  }
}

function FieldError({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null
  return (
    <p id={`${id}-error`} className={ERROR}>
      {error}
    </p>
  )
}

function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string
  label: string
  error: string | undefined
  help?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {help && <p className={HELP}>{help}</p>}
      <FieldError id={id} error={error} />
    </div>
  )
}

// One group of fields on a surface card. Not a named region: the heading is
// enough to navigate by, and a "Steps" region would clash with the Steps label.
function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 id={`${id}-heading`} className={CARD_HEADING}>
        {title}
      </h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  )
}

// Has the next page show the toast (components/Toaster.tsx). Set here, not
// in the action: a cookie set by a server action makes Next re-render this page too.
function setFlash(key: FlashKey) {
  document.cookie = flashCookie(key)
}

// Creates a recipe, or with `recipeId` (and its `status`) edits that recipe.
// Only admins see the slug. A recipe a non-admin creates, or resubmits after
// rejection, waits for review, and the labels say so.
// Images upload through the uploadRecipeImage action as soon as one is chosen.
// `imageUrlPrefix` (recipeImageUrlPrefix) plus a public ID is the preview's Cloudinary URL.
export default function RecipeForm({
  admin,
  recipeId,
  status,
  rejectionReason,
  initialValues = EMPTY_VALUES,
  imageUrlPrefix,
}: {
  admin: boolean
  recipeId?: string
  status?: RecipeStatus
  rejectionReason?: string
  initialValues?: RecipeFormValues
  imageUrlPrefix: string
}) {
  const router = useRouter()
  const forReview = !recipeId && !admin
  const ownerEdit = !!recipeId && !admin
  // The server sends a rejected recipe its owner saves back to review.
  const resubmit = ownerEdit && status === 'rejected'
  const submitLabel = forReview
    ? 'Submit for review'
    : resubmit
      ? 'Resubmit for review'
      : ownerEdit
        ? 'Save changes'
        : 'Save recipe'
  const intro = !recipeId
    ? 'Please fill out the form to add a new recipe.'
    : resubmit
      ? 'Saving sends the recipe back for review.'
      : ownerEdit
        ? 'Your changes stay pending until an admin reviews the recipe.'
        : 'Change any field and save the recipe.'
  const [uploaded, setUploaded] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  // The chosen file, shown while it uploads.
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    setFocus,
    setValue,
  } = useForm<RecipeFormValues, unknown, RecipeFormOutput>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: initialValues,
    // showInvalid does it: RHF can't match an ingredients error to the
    // ingredient inputs, which are registered as ingredients.N.line.
    shouldFocusError: false,
  })
  const ingredients = useFieldArray({ control, name: 'ingredients' })
  const imagePublicId = useWatch({ control, name: 'imagePublicId' })
  const previewSrc = localPreview ?? (imagePublicId ? `${imageUrlPrefix}${imagePublicId}` : null)

  // Frees each object URL once it's replaced or the form goes away.
  useEffect(() => {
    if (!localPreview) return
    return () => URL.revokeObjectURL(localPreview)
  }, [localPreview])
  const ingredientsError = listError(errors.ingredients)
  const stepsError = listError(errors.steps)
  const tagsError = listError(errors.tags)

  // Shows errors that have no input in the alert, and focuses the first
  // invalid input; errors on the ingredients list focus its first input.
  function showInvalid(invalid: string[]) {
    const noInput = Object.entries(NO_INPUT_ERRORS).find(([name]) => invalid.includes(name))
    if (noInput) setError('root.server', { message: noInput[1] })
    const first = FIELD_ORDER.find((name) => invalid.includes(name))
    if (first) setFocus(first === 'ingredients' ? 'ingredients.0.line' : first)
  }

  async function save(values: RecipeFormOutput) {
    let result: SaveResult
    // A throw (an ended session, a network failure) means nothing was saved.
    try {
      result = recipeId ? await updateRecipe(recipeId, values) : await createRecipe(values)
    } catch {
      return setError('root.server', { message: SAVE_FAILED })
    }
    if (result.ok) {
      setFlash(forReview || resubmit ? 'submitted' : 'saved')
      return router.push(`/recipes/${result.slug}`)
    }
    if ('formError' in result) return setError('root.server', { message: result.formError })
    // The action's field errors are keyed by schema field, and the form uses the same names.
    Object.entries(result.fieldErrors).forEach(([field, messages]) => {
      setError(field as FieldPath<RecipeFormValues>, { message: messages[0] })
    })
    showInvalid(Object.keys(result.fieldErrors))
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setUploadError('')

    // Clearing the input lets the same file be picked again after an error.
    // Dropping the local preview brings back the previous image, if any.
    const reject = (message: string) => {
      setUploadError(message)
      setLocalPreview(null)
      input.value = ''
    }

    // The server enforces the limit too; this saves sending a file it will refuse.
    if (file.size > MAX_UPLOAD_BYTES) return reject(UPLOAD_TOO_LARGE_MESSAGE)

    setUploaded(false)
    setLocalPreview(URL.createObjectURL(file))

    const formData = new FormData()
    formData.set('file', file)
    let result: UploadResult
    // Saving waits for the upload, so the recipe can't be saved without its image.
    setUploading(true)
    try {
      result = await uploadRecipeImage(formData)
    } catch {
      return reject(UPLOAD_FAILED)
    } finally {
      setUploading(false)
    }
    if (!result.ok) return reject(result.error)
    setValue('imagePublicId', result.publicId)
    setLocalPreview(null)
    setUploaded(true)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl text-text text-balance">{recipeId ? 'Edit Recipe' : 'New Recipe'}</h1>
      <p className="mt-2 text-muted">
        {intro}
      </p>
      {forReview && <p className="mt-1 text-sm text-muted">Submissions are reviewed before they appear publicly.</p>}
      {status === 'rejected' && <RecipeStatusBanner status={status} rejectionReason={rejectionReason} className="mt-6" />}

      <form className="mt-8 space-y-6" onSubmit={handleSubmit(save, (invalid) => showInvalid(Object.keys(invalid)))} noValidate>
        <Card id="basics" title="Basics">
          <Field id="name" label="Recipe name" error={errors.name?.message}>
            <input
              id="name"
              type="text"
              className={INPUT}
              {...register('name')}
              {...errorProps('name', errors.name?.message)}
            />
          </Field>

          {recipeId && admin && (
            <Field
              id="slug"
              label="Slug"
              error={errors.slug?.message}
              help="The recipe's address: /recipes/<slug>. Lowercase letters and numbers joined by hyphens."
            >
              <input
                id="slug"
                type="text"
                className={INPUT}
                {...register('slug')}
                {...errorProps('slug', errors.slug?.message)}
              />
            </Field>
          )}

          <Field
            id="description"
            label="Description"
            error={errors.description?.message}
            help="Write a brief description of the recipe"
          >
            <textarea
              id="description"
              rows={3}
              className={INPUT}
              {...register('description')}
              {...errorProps('description', errors.description?.message)}
            />
          </Field>

          <Field id="tags" label="Tags" error={tagsError} help="Separate tags with commas.">
            <input
              id="tags"
              type="text"
              className={INPUT}
              {...register('tags')}
              {...errorProps('tags', tagsError)}
            />
          </Field>
        </Card>

        <Card id="ingredients" title="Ingredients">
          <div>
            <SortableIngredients
              ids={ingredients.fields.map((field) => field.id)}
              onMove={ingredients.move}
              labelledBy="ingredients-heading"
            >
              {ingredients.fields.map((field, index) => {
                const n = index + 1
                return (
                  <SortableIngredient key={field.id} id={field.id} n={n} onRemove={() => ingredients.remove(index)}>
                    <label htmlFor={`ingredient-${n}`} className="sr-only">
                      {`Ingredient ${n}`}
                    </label>
                    <input
                      id={`ingredient-${n}`}
                      type="text"
                      placeholder="e.g. 2 cups flour"
                      className={INPUT}
                      {...register(`ingredients.${index}.line`)}
                      {...errorProps('ingredients', ingredientsError)}
                    />
                  </SortableIngredient>
                )
              })}
            </SortableIngredients>
            <FieldError id="ingredients" error={ingredientsError} />
            <button
              type="button"
              className={`mt-4 ${SECONDARY_BUTTON}`}
              onClick={() => ingredients.append({ line: '' })}
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              Add ingredient
            </button>
          </div>
        </Card>

        {/* The heading is the textarea's label, so "Steps" isn't shown twice. */}
        <section className={CARD}>
          <h2 className={CARD_HEADING}>
            <label htmlFor="steps">Steps</label>
          </h2>
          <textarea
            id="steps"
            rows={8}
            className={`mt-4 ${INPUT}`}
            {...register('steps')}
            {...errorProps('steps', stepsError)}
          />
          <p className={HELP}>One step per line.</p>
          <FieldError id="steps" error={stepsError} />
        </section>

        <Card id="times" title="Times & servings">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field id="prepTime" label="Prep time (minutes)" error={errors.prepTime?.message}>
              <input
                id="prepTime"
                type="number"
                min={0}
                className={INPUT}
                {...register('prepTime')}
                {...errorProps('prepTime', errors.prepTime?.message)}
              />
            </Field>
            <Field id="cookTime" label="Cook time (minutes)" error={errors.cookTime?.message}>
              <input
                id="cookTime"
                type="number"
                min={0}
                className={INPUT}
                {...register('cookTime')}
                {...errorProps('cookTime', errors.cookTime?.message)}
              />
            </Field>
            <Field id="servings" label="Servings" error={errors.servings?.message}>
              <input
                id="servings"
                type="number"
                min={1}
                className={INPUT}
                {...register('servings')}
                {...errorProps('servings', errors.servings?.message)}
              />
            </Field>
          </div>
        </Card>

        <Card id="photo" title="Photo">
          <div>
            {previewSrc && (
              <div className="relative mb-4 aspect-4/3 w-full max-w-sm overflow-hidden rounded-lg bg-accent-soft">
                <Image
                  src={previewSrc}
                  alt="Recipe photo preview"
                  fill
                  sizes="384px"
                  className={`object-cover ${localPreview ? 'opacity-60' : ''}`}
                />
              </div>
            )}
            {/* The input is visually hidden; its label is the visible button. */}
            <label
              htmlFor="file-upload"
              className={`${SECONDARY_BUTTON} cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus`}
            >
              <PhotoIcon className="h-5 w-5" aria-hidden="true" />
              {imagePublicId ? 'Replace image' : 'Upload an image'}
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                aria-describedby={uploadError ? 'file-upload-error' : undefined}
                onChange={handleUpload}
                disabled={uploading}
                className="sr-only"
              />
            </label>
            {/* Always rendered, so screen readers announce its changes. */}
            <p role="status" className="mt-3 flex min-h-5 items-center gap-x-2 text-sm">
              {uploading && (
                <>
                  <span
                    className="h-4 w-4 rounded-full border-2 border-border-strong border-t-primary motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  <span className="text-muted">Uploading…</span>
                </>
              )}
              {uploaded && (
                <>
                  <CheckCircleIcon className="h-5 w-5 text-success" aria-hidden="true" />
                  <span className="font-medium text-success">Image uploaded!</span>
                </>
              )}
            </p>
            {uploadError && (
              <p id="file-upload-error" role="alert" className={ERROR}>
                {uploadError}
              </p>
            )}
          </div>
        </Card>

        <Card id="notes" title="Notes & credit">
          <Field id="notes" label="Notes" error={errors.notes?.message} help="Tips or suggested sides.">
            <textarea
              id="notes"
              rows={3}
              className={INPUT}
              {...register('notes')}
              {...errorProps('notes', errors.notes?.message)}
            />
          </Field>

          <Field id="credit" label="Credit" error={errors.credit?.message}>
            <input
              id="credit"
              type="text"
              className={INPUT}
              {...register('credit')}
              {...errorProps('credit', errors.credit?.message)}
            />
          </Field>
        </Card>

        <div>
          {errors.root?.server && (
            <p role="alert" className={ERROR}>
              {errors.root.server.message}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || uploading}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-on-primary shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
