'use client'

import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { useWakeLock } from '../lib/useWakeLock'
import type { WakeLockState } from '../lib/wakeLock'

type CookModeValue = { on: boolean; toggle: () => void; wakeLock: WakeLockState }

const CookModeContext = createContext<CookModeValue | null>(null)

// Cook mode for the recipe page: keeps the screen awake and trims the page
// to what's needed at the stove. The root carries data-cook-mode while on, so
// server-rendered parts restyle with group-data-cook-mode/cook variants.
// Off on every load.
export default function CookMode({ className, children }: { className: string; children: ReactNode }) {
  const [on, setOn] = useState(false)
  const wakeLock = useWakeLock(on)

  return (
    <CookModeContext value={{ on, toggle: () => setOn(!on), wakeLock }}>
      <div data-cook-mode={on ? '' : undefined} className={`group/cook ${className}`}>
        {children}
      </div>
    </CookModeContext>
  )
}

// The toggle, with a note once the screen can't be kept awake. The note sits in
// an always-rendered live region, empty until then, so it's announced when it
// appears; it isn't shown while the first request is still in flight.
export function CookModeToggle() {
  const cookMode = useContext(CookModeContext)
  const noteId = useId()
  if (!cookMode) throw new Error('CookModeToggle must be inside CookMode')
  const { on, toggle, wakeLock } = cookMode
  const showNote = on && wakeLock === 'unavailable'

  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        aria-describedby={showNote ? noteId : undefined}
        onClick={toggle}
        className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft aria-pressed:bg-primary-soft aria-pressed:text-on-primary-soft"
      >
        Cook mode
      </button>
      {/* While empty, -ml-3 cancels the row's gap-3 so the button stays flush right. */}
      <span id={noteId} aria-live="polite" className="text-sm text-muted empty:-ml-3">
        {showNote && 'Your screen may still go to sleep.'}
      </span>
    </>
  )
}
