'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { deleteRecipe, type DeleteResult } from '../app/recipes/actions'
import { flashCookie } from '../lib/flash'

const DELETE_FAILED = 'Something went wrong and the recipe was not deleted. Reload the page and try again.'

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY_BUTTON = `${BUTTON} border border-border-strong bg-surface text-text hover:bg-primary-soft hover:text-on-primary-soft`
// Surface text on danger meets contrast in both themes (dark danger is light).
const DANGER_BUTTON = `${BUTTON} bg-danger text-surface shadow-xs hover:bg-danger/90`

// The admin-only "Delete recipe" section below the edit form, with its
// confirm dialog. On success the next page shows the toast
// (components/Toaster.tsx); the recipe is gone, so it goes to /recipes.
export default function DeleteRecipe({ recipeId, name }: { recipeId: string; name: string }) {
  const router = useRouter()
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const [deleting, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Escape, the backdrop and Cancel all land here; none closes mid-delete.
  function close() {
    if (deleting) return
    setOpen(false)
    setError('')
  }

  function confirm() {
    setError('')
    startTransition(async () => {
      let result: DeleteResult
      // A throw (an ended session, a network failure) means nothing was deleted.
      try {
        result = await deleteRecipe(recipeId)
      } catch {
        return setError(DELETE_FAILED)
      }
      if (!result.ok) return setError(result.formError)
      document.cookie = flashCookie('deleted')
      router.replace('/recipes')
    })
  }

  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-3xl px-4 pb-10 sm:px-6 lg:px-8 print:hidden">
      <div className="border-t border-border pt-8">
        <h2 id={headingId} className="font-display text-xl text-text text-balance">
          Delete recipe
        </h2>
        <p className="mt-2 text-sm text-muted">Removes it for everyone, along with its photo. This can&apos;t be undone.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`mt-4 ${BUTTON} border border-danger bg-surface text-danger hover:bg-danger/10`}
        >
          Delete recipe
        </button>
      </div>

      {/* Fixed, not relative: the dialog element gets the viewport's box, so it counts as visible. */}
      <Dialog open={open} onClose={close} className="fixed inset-0 z-20">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/50 transition-opacity data-closed:opacity-0 data-enter:duration-150 data-leave:duration-100 motion-reduce:transition-none"
        />
        <div className="fixed inset-0 flex w-screen items-center justify-center overflow-y-auto p-4">
          <DialogPanel
            transition
            className="w-full max-w-md rounded-xl bg-surface p-6 text-text shadow-2xl ring-1 ring-border transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-150 data-enter:ease-out data-leave:duration-100 data-leave:ease-in motion-reduce:transition-none"
          >
            <DialogTitle className="font-display text-xl text-text text-balance break-words">Delete {name}?</DialogTitle>
            <p className="mt-2 text-sm text-muted">It&apos;s removed for everyone, along with its photo. This can&apos;t be undone.</p>
            {error && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" data-autofocus disabled={deleting} onClick={close} className={SECONDARY_BUTTON}>
                Cancel
              </button>
              <button type="button" disabled={deleting} onClick={confirm} className={DANGER_BUTTON}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </section>
  )
}
