'use client'

import { useState, type FormEvent } from 'react'
import { importRecipe, type ImportResult } from '../app/recipes/actions'
import { CARD, CARD_HEADING, ERROR, errorProps, HELP, INPUT, LABEL, SECONDARY_BUTTON } from './formStyles'
import type { RecipeFormValues } from './RecipeForm'

const EMPTY_LINK = 'Paste a link to import.'
const IMPORT_FAILED = 'Something went wrong and the recipe was not imported. Reload the page and try again.'
const IMPORTED = 'Recipe imported. Check it over before saving.'
const PHOTO_FAILED = " The photo couldn't be imported, so add one below if you like."

// The admin-only "Import from a link" box above the recipe form on /new. The
// server validates the link; `onImported` gets the recipe's form values, and
// `onImportingChange` says when an import starts and ends. `disabled` holds
// off an import while the recipe form is busy (an upload, a save).
export default function ImportRecipe({
  disabled,
  onImported,
  onImportingChange,
}: {
  disabled: boolean
  onImported: (values: RecipeFormValues) => void
  onImportingChange: (importing: boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  function setBusy(busy: boolean) {
    setImporting(busy)
    onImportingChange(busy)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    if (!url.trim()) return setError(EMPTY_LINK)

    let result: ImportResult
    // A throw (an ended session, a network failure) means nothing was imported.
    setBusy(true)
    try {
      result = await importRecipe(url)
    } catch {
      return setError(IMPORT_FAILED)
    } finally {
      setBusy(false)
    }
    if (!result.ok) return setError(result.error)
    onImported(result.values)
    setUrl('')
    setStatus(result.photoFailed ? IMPORTED + PHOTO_FAILED : IMPORTED)
  }

  return (
    <section aria-labelledby="import-heading" className={`mt-8 ${CARD} print:hidden`}>
      <h2 id="import-heading" className={CARD_HEADING}>
        Import from a link
      </h2>
      <p className={HELP}>
        Paste a link to a recipe page. The form below fills in for you to check before saving. Importing replaces
        anything already in the form.
      </p>
      <form className="mt-4" onSubmit={handleSubmit} noValidate>
        <label htmlFor="recipe-link" className={LABEL}>
          Recipe link
        </label>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row">
          <input
            id="recipe-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            readOnly={importing}
            className={INPUT}
            {...errorProps('recipe-link', error)}
          />
          <button
            type="submit"
            disabled={importing || disabled}
            className={`${SECONDARY_BUTTON} shrink-0 justify-center disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
        {error && (
          <p id="recipe-link-error" role="alert" className={ERROR}>
            {error}
          </p>
        )}
        {/* Always rendered, so screen readers announce its changes. */}
        <p role="status" className="mt-2 text-sm font-medium text-success">
          {status}
        </p>
      </form>
    </section>
  )
}
