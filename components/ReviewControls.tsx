'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { approveRecipe, rejectRecipe, type ReviewResult } from '../app/recipes/actions'
import { MAX_REJECTION_REASON_LENGTH } from '../lib/constants'
import { FLASH_EVENT, flashCookie, type FlashKey } from '../lib/flash'

const DECISION_FAILED = 'Something went wrong and nothing was saved. Reload the page and try again.'

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY_BUTTON = `${BUTTON} bg-primary text-on-primary shadow-xs hover:bg-primary/90`
const SECONDARY_BUTTON = `${BUTTON} border border-border-strong bg-surface text-text hover:bg-primary-soft hover:text-on-primary-soft`
const ERROR = 'mt-2 text-sm text-danger'

// Shows the toast on this page (components/Toaster.tsx), which doesn't navigate.
function flash(key: FlashKey) {
  document.cookie = flashCookie(key)
  window.dispatchEvent(new Event(FLASH_EVENT))
}

// Approve, and Reject with a required reason, for one queued recipe, as of
// its `updatedAt` (ms). On success the action re-renders the queue without
// it, so this unmounts; focus moves to the element `focusAfterId` (the
// queue's heading) instead of falling to <body>.
export default function ReviewControls({
  recipeId,
  updatedAt,
  name,
  focusAfterId,
}: {
  recipeId: string
  updatedAt: number
  name: string
  focusAfterId: string
}) {
  const [saving, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState('')
  const [reasonError, setReasonError] = useState('')
  const reasonId = `reason-${recipeId}`

  function decide(action: () => Promise<ReviewResult>, key: FlashKey) {
    setError('')
    setReasonError('')
    startTransition(async () => {
      let result: ReviewResult
      // A throw (an ended session, a network failure) means nothing was saved.
      try {
        result = await action()
      } catch {
        return setError(DECISION_FAILED)
      }
      if (result.ok) {
        document.getElementById(focusAfterId)!.focus()
        return flash(key)
      }
      if ('formError' in result) return setError(result.formError)
      setReasonError(result.fieldErrors.reason[0])
    })
  }

  // The browser blocks an empty reason (required); the server rejects a blank one.
  function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('reason'))
    decide(() => rejectRecipe(recipeId, updatedAt, reason), 'rejected')
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" disabled={saving} onClick={() => decide(() => approveRecipe(recipeId, updatedAt), 'approved')} className={PRIMARY_BUTTON}>
          Approve<span className="sr-only"> {name}</span>
        </button>
        <button
          type="button"
          aria-expanded={rejecting}
          disabled={saving}
          onClick={() => {
            setRejecting(!rejecting)
            setReasonError('')
          }}
          className={SECONDARY_BUTTON}
        >
          Reject<span className="sr-only"> {name}</span>…
        </button>
      </div>
      {rejecting && (
        <form onSubmit={reject} className="mt-4">
          <label htmlFor={reasonId} className="block text-sm font-medium text-text">
            Reason for rejecting
          </label>
          {/* Colors and focus ring come from the forms-plugin overrides in styles/globals.css. */}
          <textarea
            id={reasonId}
            name="reason"
            rows={3}
            required
            maxLength={MAX_REJECTION_REASON_LENGTH}
            autoFocus
            aria-describedby={`${reasonId}-help${reasonError ? ` ${reasonId}-error` : ''}`}
            aria-invalid={reasonError ? true : undefined}
            className="mt-1 block min-h-11 w-full min-w-0 rounded-lg shadow-xs sm:text-sm"
          />
          <p id={`${reasonId}-help`} className="mt-2 text-sm text-muted">
            The submitter sees this on their recipe. Up to {MAX_REJECTION_REASON_LENGTH} characters.
          </p>
          {reasonError && (
            <p id={`${reasonId}-error`} role="alert" className={ERROR}>
              {reasonError}
            </p>
          )}
          <button type="submit" disabled={saving} className={`mt-3 w-full sm:w-auto ${SECONDARY_BUTTON}`}>
            Reject recipe
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
    </div>
  )
}
