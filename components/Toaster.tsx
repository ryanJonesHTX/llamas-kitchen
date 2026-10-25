'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CLEAR_FLASH_COOKIE, FLASH_EVENT, flashCookieValue, flashMessage } from '../lib/flash'

const DISMISS_AFTER_MS = 4000

// Shows the flash message left in the flash cookie. Saves navigate on the
// client, so the root layout doesn't re-render; the cookie is checked on
// mount, after every navigation and on FLASH_EVENT instead, then cleared.
// The live region is just the message, so "Dismiss" isn't announced with it.
// It and the card stay mounted so screen readers announce inserted text; the
// card is styled and fades in only while there's a message. Each flash gets
// its own id, so a repeat of the same text restarts the timer and, keyed on
// the id, is inserted (and announced) again.
export default function Toaster() {
  const pathname = usePathname()
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const lastId = useRef(0)
  const message = toast?.text

  useEffect(() => {
    function showFlash() {
      const key = flashCookieValue(document.cookie)
      if (key === undefined) return
      document.cookie = CLEAR_FLASH_COOKIE
      const text = flashMessage(key)
      setToast(text === null ? null : { text, id: ++lastId.current })
    }
    // The cookie is browser state, readable only after mount; no render can derive it.
    showFlash()
    window.addEventListener(FLASH_EVENT, showFlash)
    return () => window.removeEventListener(FLASH_EVENT, showFlash)
  }, [pathname])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6 print:hidden">
      <div
        className={`flex items-center gap-x-3 rounded-xl text-sm font-medium text-text ${
          message
            ? 'pointer-events-auto border border-border bg-surface py-1 pr-1 pl-4 shadow-lg motion-safe:transition motion-safe:duration-200'
            : 'translate-y-2 opacity-0'
        }`}
      >
        {message && <CheckCircleIcon className="size-5 shrink-0 text-success" aria-hidden="true" />}
        <p role="status" aria-live="polite">
          {toast && <span key={toast.id}>{toast.text}</span>}
        </p>
        {message && (
          <button
            type="button"
            onClick={() => setToast(null)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-text"
          >
            <span className="sr-only">Dismiss</span>
            <XMarkIcon className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
