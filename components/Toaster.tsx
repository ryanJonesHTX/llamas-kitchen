'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CLEAR_FLASH_COOKIE, flashCookieValue, flashMessage } from '../lib/flash'

const DISMISS_AFTER_MS = 4000

// Shows the flash message RecipeForm left in the flash cookie. Saves
// navigate on the client, so the root layout doesn't re-render; the cookie
// is checked on mount and after every navigation instead, then cleared.
// The live region stays mounted so screen readers announce inserted text.
export default function Toaster() {
  const pathname = usePathname()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const key = flashCookieValue(document.cookie)
    if (key === undefined) return
    document.cookie = CLEAR_FLASH_COOKIE
    // The cookie is browser state, readable only after mount; no render can derive it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(flashMessage(key))
  }, [pathname])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6 print:hidden"
    >
      {message && (
        <div className="pointer-events-auto flex items-center gap-x-3 rounded-xl border border-border bg-surface py-1 pr-1 pl-4 text-sm font-medium text-text shadow-lg motion-safe:transition motion-safe:duration-200 motion-safe:starting:translate-y-2 motion-safe:starting:opacity-0">
          <CheckCircleIcon className="size-5 shrink-0 text-success" aria-hidden="true" />
          <p>{message}</p>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-text"
          >
            <span className="sr-only">Dismiss</span>
            <XMarkIcon className="size-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
