import type { RecipeCardData } from './card'

// The /recipes grid's appended pages and scroll position, kept in memory per
// history entry, so Back and Forward return to them. The entry's key lives in
// history.state, alongside Next's own state. The memory belongs to the
// document: a reload or a fresh visit to the same URL starts the grid again.

export type SavedGrid = {
  // The grid's identity: its listing href and first card.
  listing: string
  appended: RecipeCardData[]
  nextCursor: string | null
  scrollY: number
}

const ENTRY_KEY = 'recipeGridEntry'
const savedGrids = new Map<string, SavedGrid>()

// The current history entry's key, added to history.state on first use. The
// spread keeps Next's state, so Next's patched replaceState passes it through.
export function historyEntryKey(): string {
  const key = window.history.state?.[ENTRY_KEY]
  if (typeof key === 'string') return key
  const fresh = Math.random().toString(36).slice(2)
  window.history.replaceState({ ...window.history.state, [ENTRY_KEY]: fresh }, '')
  return fresh
}

export function readGrid(entry: string, listing: string): SavedGrid | null {
  const saved = savedGrids.get(entry)
  return saved?.listing === listing ? saved : null
}

// Saves only while the entry is current: once a navigation has moved on, the
// scroll position belongs to the next page.
export function saveGrid(entry: string, grid: SavedGrid) {
  if (window.history.state?.[ENTRY_KEY] !== entry) return
  savedGrids.set(entry, grid)
}
