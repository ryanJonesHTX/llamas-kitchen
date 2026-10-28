import type { Page } from '@playwright/test'

// A fake Screen Wake Lock API, installed before any page script runs.
// Headless Chromium's real one is unreliable, so cook mode tests use this.
//
// - 'resolve': request('screen') resolves with a sentinel.
// - 'slow': like 'resolve', but only after REQUEST_DELAY_MS.
// - 'reject': request('screen') rejects, as a browser that refuses does.
// - 'absent': navigator.wakeLock is undefined, as in a browser without it.
//
// Every request and every release the page makes is logged on
// window.__wakeLock, read back with wakeLockLog.
export type WakeLockMode = 'resolve' | 'slow' | 'reject' | 'absent'

const REQUEST_DELAY_MS = 500

export type WakeLockLog = {
  // The type passed to each request() call, in order.
  requests: string[]
  // How many times the page called release() on a sentinel.
  releases: number
  // Sentinels that are neither released by the page nor dropped by the browser.
  held: number
}

type FakeSentinel = { released: boolean; drop: () => void }
type FakeWindow = Window & {
  __wakeLock: { requests: string[]; releases: number; sentinels: FakeSentinel[] }
  __visibility: 'visible' | 'hidden'
}

export async function fakeWakeLock(page: Page, mode: WakeLockMode = 'resolve'): Promise<void> {
  await page.addInitScript(({ mode, delay }: { mode: WakeLockMode; delay: number }) => {
    const win = window as unknown as FakeWindow
    const log: FakeWindow['__wakeLock'] = { requests: [], releases: 0, sentinels: [] }
    win.__wakeLock = log

    // document.visibilityState is read-only; this makes it settable from tests.
    win.__visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => win.__visibility })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => win.__visibility === 'hidden' })

    if (mode === 'absent') {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined })
      return
    }

    const request = async (type: string) => {
      log.requests.push(type)
      if (mode === 'reject') throw new DOMException('Wake lock refused', 'NotAllowedError')
      if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, delay))

      const listeners: Array<() => void> = []
      const sentinel = {
        type,
        released: false,
        onrelease: null as null | (() => void),
        addEventListener: (event: string, listener: () => void) => {
          if (event === 'release') listeners.push(listener)
        },
        removeEventListener: (event: string, listener: () => void) => {
          const index = listeners.indexOf(listener)
          if (event === 'release' && index !== -1) listeners.splice(index, 1)
        },
        // The browser letting go of the lock (e.g. the tab was hidden).
        drop: () => {
          if (sentinel.released) return
          sentinel.released = true
          for (const listener of [...listeners]) listener()
          sentinel.onrelease?.()
        },
        release: async () => {
          if (sentinel.released) return
          log.releases += 1
          sentinel.drop()
        },
      }
      log.sentinels.push(sentinel)
      return sentinel
    }

    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
  }, { mode, delay: REQUEST_DELAY_MS })
}

export async function wakeLockLog(page: Page): Promise<WakeLockLog> {
  return page.evaluate(() => {
    const { requests, releases, sentinels } = (window as unknown as FakeWindow).__wakeLock
    return { requests: [...requests], releases, held: sentinels.filter((sentinel) => !sentinel.released).length }
  })
}

// Hides the tab: visibilityState turns 'hidden', visibilitychange fires, and
// the browser drops every held lock.
export async function hideTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as FakeWindow
    win.__visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    for (const sentinel of win.__wakeLock.sentinels) sentinel.drop()
  })
}

// Shows the tab again: visibilityState turns 'visible' and visibilitychange fires.
export async function showTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as FakeWindow
    win.__visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
  })
}
