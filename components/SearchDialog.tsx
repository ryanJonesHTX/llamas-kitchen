'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { CakeIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { SearchResult } from '../app/api/search/route'
import { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS } from '../lib/constants'
import { listingHref } from '../lib/recipes/listingHref'
import { searchWords } from '../lib/recipes/searchWords'

// The header's command-palette search: a trigger (a field-like button on
// desktop, an icon on phones), the ⌘K / Ctrl+K shortcut, and a dialog with
// live results from /api/search.

const DEBOUNCE_MS = 200
const MAX_TAGS = 3

const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform)

const SHORTCUTS = {
  apple: { keys: 'Meta+K', hint: '⌘K' },
  other: { keys: 'Control+K', hint: 'Ctrl K' },
} as const

const noSubscription = () => () => {}

// Null on the server and while hydrating, so the hint can't mismatch.
function useShortcut() {
  return useSyncExternalStore(
    noSubscription,
    () => (isApple() ? SHORTCUTS.apple : SHORTCUTS.other),
    () => null
  )
}

// ⌘K on Apple platforms, Ctrl+K elsewhere, calls onOpen from anywhere, form
// fields included, instead of the browser's own binding. onOpen should be stable.
export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.isComposing) return
      const modifier = isApple() ? event.metaKey : event.ctrlKey
      if (!modifier || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      onOpen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}

// Desktop: a narrow field-like button with the shortcut hint. Phones
// (compact): a 44px icon button.
export function SearchTrigger({ compact = false, onClick }: { compact?: boolean; onClick: () => void }) {
  const shortcut = useShortcut()

  if (compact) {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onClick}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-text"
      >
        <span className="sr-only">Search recipes</span>
        <MagnifyingGlassIcon className="h-6 w-6" aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts={shortcut?.keys}
      onClick={onClick}
      className="flex items-center gap-x-2 rounded-md border border-border-strong bg-surface py-1.5 pr-2 pl-2.5 text-sm text-muted shadow-xs hover:text-text xl:w-56"
    >
      <MagnifyingGlassIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Search<span className="sr-only"> recipes</span>
      </span>
      {shortcut && (
        <kbd aria-hidden="true" className="ml-auto rounded border border-border px-1.5 font-sans text-xs">
          {shortcut.hint}
        </kbd>
      )}
    </button>
  )
}

// Closing returns focus to whatever had it before opening: the trigger, or
// the field the shortcut was pressed in.
export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-20">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/50 transition-opacity data-closed:opacity-0 data-enter:duration-150 data-leave:duration-100 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 w-screen overflow-y-auto sm:p-6 sm:pt-[12vh]">
        <DialogPanel
          transition
          className="mx-auto flex min-h-full flex-col overflow-hidden bg-surface text-text shadow-2xl ring-border transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-150 data-enter:ease-out data-leave:duration-100 data-leave:ease-in motion-reduce:transition-none sm:min-h-0 sm:max-w-xl sm:rounded-xl sm:ring-1"
        >
          <DialogTitle className="sr-only">Search recipes</DialogTitle>
          <SearchPanel onClose={onClose} />
        </DialogPanel>
      </div>
    </Dialog>
  )
}

// The response for one search text, kept with that text so a response for an
// older text never shows as the current one.
type Fetched = { text: string } & (
  | { outcome: 'results'; results: SearchResult[] }
  | { outcome: 'error' | 'limited' }
)

// Mounted with the dialog, so every open starts empty.
function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [fetched, setFetched] = useState<Fetched | null>(null)
  const text = query.trim()
  const wordCount = searchWords(text).length
  // The server rejects more words than this, so they are never sent.
  const tooManyWords = wordCount > MAX_SEARCH_WORDS
  const searchable = wordCount > 0 && !tooManyWords

  // Debounced; a newer text aborts the request for the older one.
  useEffect(() => {
    if (!searchable) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?${new URLSearchParams({ q: text })}`, { signal: controller.signal })
        if (response.status === 429) {
          if (!controller.signal.aborted) setFetched({ text, outcome: 'limited' })
          return
        }
        if (!response.ok) throw new Error(`search failed with ${response.status}`)
        const { results }: { results: SearchResult[] } = await response.json()
        if (!controller.signal.aborted) setFetched({ text, outcome: 'results', results })
      } catch {
        if (!controller.signal.aborted) setFetched({ text, outcome: 'error' })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, searchable])

  const current = fetched?.text === text ? fetched : null
  const loading = searchable && current === null
  const results = current?.outcome === 'results' ? current.results : null
  // While a newer search loads, the previous results stay, disabled, so the
  // list doesn't jump. A row highlighted before still reads as highlighted to
  // the combobox, so onKeyDown treats loading as no highlight.
  const rows = results ?? (loading && fetched?.outcome === 'results' ? fetched.results : [])
  const seeAllHref = listingHref({ tags: [], time: undefined, sort: 'newest', q: text })

  let message: string | null = null
  if (!text) message = 'Search recipes by name, ingredient or tag.'
  else if (tooManyWords) message = `Use at most ${MAX_SEARCH_WORDS} words.`
  else if (wordCount === 0 || results?.length === 0) message = `No recipes match “${text}”.`
  else if (current?.outcome === 'limited') message = 'Too many searches, try again in a moment.'
  else if (current?.outcome === 'error') message = 'Search failed. Try again.'
  else if (loading && rows.length === 0) message = 'Searching…'

  // Announced politely once a search settles: the count, or why there is none.
  let announcement = ''
  if (results?.length) announcement = `${results.length} ${results.length === 1 ? 'result' : 'results'}`
  else if (text && !loading && message) announcement = message

  function go(href: string | null) {
    if (href === null) return
    router.push(href)
    onClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, activeIndex: number | null) {
    if (event.nativeEvent.isComposing) return
    // preventDefault skips the combobox's own handling of the key.
    switch (event.key) {
      // The combobox would take the first Escape to close its list.
      case 'Escape':
        event.preventDefault()
        onClose()
        break
      // With no row highlighted, or only a stale one while loading, Enter
      // lists every match on /recipes. With too many words it does nothing.
      case 'Enter':
        if (activeIndex !== null && !loading) break
        event.preventDefault()
        if (text && !tooManyWords) go(seeAllHref)
        break
      // The combobox picks the highlighted row on Tab, which would navigate.
      case 'Tab':
        event.preventDefault()
        break
    }
  }

  return (
    <Combobox value={null} onChange={go}>
      {({ activeIndex }) => (
        <>
          <div className="flex items-center border-b border-border pr-1 sm:pr-0">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon
                className="pointer-events-none absolute inset-y-0 left-4 h-full w-5 text-muted"
                aria-hidden="true"
              />
              {/* displayValue keeps the typed text when the list closes, e.g. on blur. */}
              <ComboboxInput
                autoFocus
                aria-label="Search recipes"
                maxLength={MAX_SEARCH_QUERY_LENGTH}
                placeholder="Search by name, ingredient or tag"
                displayValue={() => query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => onKeyDown(event, activeIndex)}
                className="h-14 w-full border-0 bg-transparent pr-4 pl-12 text-base text-text placeholder:text-muted focus:ring-0 sm:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:text-text sm:hidden"
            >
              <span className="sr-only">Close search</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {rows.length > 0 && (
            <ComboboxOptions
              static
              modal={false}
              className={`overflow-y-auto p-2 sm:max-h-[min(28rem,70vh)] ${loading ? 'opacity-60' : ''}`}
            >
              {rows.map((row) => (
                <ComboboxOption
                  key={row.slug}
                  value={`/recipes/${row.slug}`}
                  disabled={loading}
                  className="group flex cursor-pointer items-center gap-x-3 rounded-md px-3 py-2 text-text select-none data-disabled:cursor-default data-focus:bg-primary data-focus:text-on-primary"
                >
                  {row.imageUrl ? (
                    <Image src={row.imageUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md bg-accent-soft object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft">
                      <CakeIcon className="h-5 w-5 text-muted" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    {row.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        <span className="sr-only">, tagged </span>
                        {row.tags.slice(0, MAX_TAGS).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-on-primary-soft"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </ComboboxOption>
              ))}
              {!loading && (
                <ComboboxOption
                  value={seeAllHref}
                  className="flex min-h-11 cursor-pointer items-center gap-x-3 rounded-md px-3 py-2 font-semibold text-text select-none data-focus:bg-primary data-focus:text-on-primary"
                >
                  <MagnifyingGlassIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">See all results for “{text}”</span>
                </ComboboxOption>
              )}
            </ComboboxOptions>
          )}

          {message && <p className="px-4 py-6 text-center text-sm break-words text-muted">{message}</p>}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </>
      )}
    </Combobox>
  )
}
