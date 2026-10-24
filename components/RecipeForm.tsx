'use client'

import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircleIcon } from '@heroicons/react/20/solid'
import {
  createRecipe,
  updateRecipe,
  uploadRecipeImage,
  type SaveResult,
  type UploadResult,
} from '../app/recipes/actions'
import { parseIngredient } from '../lib/ingredients'
import { recipeInputSchema } from '../lib/recipes/input'
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } from '../lib/uploads'

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

const SAVE_FAILED = 'Something went wrong and the recipe was not saved. Reload the page and try again.'
const UPLOAD_FAILED = 'Something went wrong and the image was not uploaded. Reload the page and try again.'

const LABEL = 'block text-sm font-medium text-gray-700'
const INPUT =
  'block w-full rounded-md border-gray-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm'
const HELP = 'mt-2 text-sm text-gray-500'
const ERROR = 'mt-2 text-sm text-red-600'
const BUTTON =
  'rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'

// Marks an input invalid and points it at its error message.
function errorProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
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
  className = 'sm:col-span-6',
  children,
}: {
  id: string
  label: string
  error: string | undefined
  help?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {help && <p className={HELP}>{help}</p>}
      <FieldError id={id} error={error} />
    </div>
  )
}

// Creates a recipe, or with `recipeId` edits that recipe (and its slug).
// Images upload through the uploadRecipeImage action as soon as one is chosen.
export default function RecipeForm({
  recipeId,
  initialValues = EMPTY_VALUES,
}: {
  recipeId?: string
  initialValues?: RecipeFormValues
}) {
  const router = useRouter()
  const [uploaded, setUploaded] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    setValue,
  } = useForm<RecipeFormValues, unknown, RecipeFormOutput>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: initialValues,
  })
  const ingredients = useFieldArray({ control, name: 'ingredients' })
  // The resolver files a list-level error under root; setError files it on the list itself.
  const ingredientsError = errors.ingredients?.root?.message ?? errors.ingredients?.message

  async function save(values: RecipeFormOutput) {
    let result: SaveResult
    // A throw (an ended session, a network failure) means nothing was saved.
    try {
      result = recipeId ? await updateRecipe(recipeId, values) : await createRecipe(values)
    } catch {
      return setError('root.server', { message: SAVE_FAILED })
    }
    if (result.ok) return router.push(`/recipes/${result.slug}`)
    if ('formError' in result) return setError('root.server', { message: result.formError })
    // The action's field errors are keyed by schema field, and the form uses the same names.
    Object.entries(result.fieldErrors).forEach(([field, messages], index) => {
      setError(field as FieldPath<RecipeFormValues>, { message: messages[0] }, { shouldFocus: index === 0 })
    })
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setUploadError('')

    // Clearing the input lets the same file be picked again after an error.
    const reject = (message: string) => {
      setUploadError(message)
      input.value = ''
    }

    // The server enforces the limit too; this saves sending a file it will refuse.
    if (file.size > MAX_UPLOAD_BYTES) return reject(UPLOAD_TOO_LARGE_MESSAGE)

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
    setUploaded(true)
  }

  return (
    <div className="overflow-hidden bg-white py-16 px-6 lg:px-8 lg:py-24">
      <div className="relative mx-auto max-w-4xl">
        <form className="space-y-8" onSubmit={handleSubmit(save)} noValidate>
          <div className="space-y-8 divide-y divide-gray-200">
            <div>
              <div>
                <h1 className="text-lg font-medium leading-6 text-gray-900">
                  {recipeId ? 'Edit Recipe' : 'New Recipe'}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {recipeId
                    ? 'Change any field and save the recipe.'
                    : 'Please fill out the form to add a new recipe.'}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <Field id="name" label="Recipe name" error={errors.name?.message}>
                  <input
                    id="name"
                    type="text"
                    className={INPUT}
                    {...register('name')}
                    {...errorProps('name', errors.name?.message)}
                  />
                </Field>

                {recipeId && (
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

                <fieldset className="sm:col-span-6">
                  <legend className={LABEL}>Ingredients</legend>
                  <ul role="list" className="mt-1 space-y-2">
                    {ingredients.fields.map((field, index) => {
                      const n = index + 1
                      return (
                        <li key={field.id} className="flex items-center gap-x-3">
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
                          <button
                            type="button"
                            aria-label={`Remove ingredient ${n}`}
                            className="font-semibold text-indigo-600 mx-1"
                            onClick={() => ingredients.remove(index)}
                          >
                            <span aria-hidden="true">&#x2715;</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <button type="button" className={`mt-3 ${BUTTON}`} onClick={() => ingredients.append({ line: '' })}>
                    Add ingredient
                  </button>
                  <FieldError id="ingredients" error={ingredientsError} />
                </fieldset>

                <Field id="steps" label="Steps" error={errors.steps?.message} help="One step per line.">
                  <textarea
                    id="steps"
                    rows={6}
                    className={INPUT}
                    {...register('steps')}
                    {...errorProps('steps', errors.steps?.message)}
                  />
                </Field>

                <Field id="tags" label="Tags" error={errors.tags?.message} help="Separate tags with commas.">
                  <input
                    id="tags"
                    type="text"
                    className={INPUT}
                    {...register('tags')}
                    {...errorProps('tags', errors.tags?.message)}
                  />
                </Field>

                <Field
                  id="servings"
                  label="Servings"
                  error={errors.servings?.message}
                  className="sm:col-start-1 sm:col-span-2"
                >
                  <input
                    id="servings"
                    type="number"
                    min={1}
                    className={INPUT}
                    {...register('servings')}
                    {...errorProps('servings', errors.servings?.message)}
                  />
                </Field>
                <Field
                  id="prepTime"
                  label="Prep time (minutes)"
                  error={errors.prepTime?.message}
                  className="sm:col-span-2"
                >
                  <input
                    id="prepTime"
                    type="number"
                    min={0}
                    className={INPUT}
                    {...register('prepTime')}
                    {...errorProps('prepTime', errors.prepTime?.message)}
                  />
                </Field>
                <Field
                  id="cookTime"
                  label="Cook time (minutes)"
                  error={errors.cookTime?.message}
                  className="sm:col-span-2"
                >
                  <input
                    id="cookTime"
                    type="number"
                    min={0}
                    className={INPUT}
                    {...register('cookTime')}
                    {...errorProps('cookTime', errors.cookTime?.message)}
                  />
                </Field>

                {/* Conditionally display upload/success */}
                {!uploaded ? (
                  <div className="sm:col-span-6">
                    <span className={LABEL}>Photo</span>
                    <div className="mt-1 flex justify-start rounded-md border border-gray-300 pl-3 py-2">
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer rounded-md bg-white font-medium text-indigo-600 focus-within:outline-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:text-indigo-500"
                        >
                          <span>Upload an image</span>
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
                      </div>
                    </div>
                    {uploadError && (
                      <p id="file-upload-error" role="alert" className={ERROR}>
                        {uploadError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="sm:col-span-6 rounded-md bg-green-50 p-4">
                    <div className="flex">
                      <div className="shrink-0">
                        <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-800">Image uploaded!</p>
                      </div>
                    </div>
                  </div>
                )}

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
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5">
            {errors.root?.server && (
              <p role="alert" className={ERROR}>
                {errors.root.server.message}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={isSubmitting || uploading} className={`ml-3 inline-flex justify-center ${BUTTON}`}>
                Save recipe
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
