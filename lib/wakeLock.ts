// The screen wake lock behind cook mode, as a small controller over the
// Screen Wake Lock API. The browser drops the lock whenever the tab is hidden
// (and may at other times); while enabled, it's requested again once the page
// is visible. Shapes are structural so tests can pass a hand-made browser.

export type WakeLockState = 'off' | 'held' | 'unavailable'

type Sentinel = {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockEnv = {
  navigator: { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }
  document: {
    visibilityState: string
    addEventListener: (type: 'visibilitychange', listener: () => void) => void
    removeEventListener: (type: 'visibilitychange', listener: () => void) => void
  }
  onChange: (state: WakeLockState) => void
}

export function createWakeLock({ navigator, document, onChange }: WakeLockEnv) {
  let state: WakeLockState = 'off'
  let enabled = false
  let sentinel: Sentinel | null = null
  let pending: Promise<void> | null = null

  function setState(next: WakeLockState) {
    if (next === state) return
    state = next
    onChange(next)
  }

  async function request() {
    const wakeLock = navigator.wakeLock
    if (!wakeLock) {
      setState('unavailable')
      return
    }
    try {
      const acquired = await wakeLock.request('screen')
      // Disabled while the request was in flight.
      if (!enabled) {
        await acquired.release()
        return
      }
      sentinel = acquired
      acquired.addEventListener('release', () => {
        // disable() clears `sentinel` first, so only a drop by the browser gets here.
        if (sentinel !== acquired) return
        sentinel = null
        setState('unavailable')
      })
      setState('held')
    } catch {
      if (enabled) setState('unavailable')
    }
  }

  function enable(): Promise<void> {
    enabled = true
    if (sentinel) return Promise.resolve()
    pending ??= request().finally(() => {
      pending = null
    })
    return pending
  }

  async function disable() {
    enabled = false
    const held = sentinel
    sentinel = null
    setState('off')
    if (held) await held.release()
  }

  function onVisibilityChange() {
    if (enabled && !sentinel && document.visibilityState === 'visible') void enable()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  function dispose() {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void disable()
  }

  return {
    enable,
    disable,
    dispose,
    get state() {
      return state
    },
  }
}
