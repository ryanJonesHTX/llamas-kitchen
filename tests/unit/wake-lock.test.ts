import { describe, expect, it, vi } from 'vitest'
import { createWakeLock, type WakeLockState } from '../../lib/wakeLock'

// The screen wake lock controller behind cook mode. The browser is faked by
// hand: each request('screen') returns a deferred promise the test settles,
// so the order of requests, resolutions and disables is under its control.

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Lets every pending promise callback run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// Like the browser's WakeLockSentinel: release() fires 'release' once, and the
// browser can drop it on its own (drop()), which also fires 'release'.
function fakeSentinel() {
  const listeners: Array<() => void> = []
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.drop()
    }),
    addEventListener: (type: 'release', listener: () => void) => {
      if (type === 'release') listeners.push(listener)
    },
    drop: () => {
      if (sentinel.released) return
      sentinel.released = true
      for (const listener of listeners) listener()
    },
  }
  return sentinel
}

type FakeSentinel = ReturnType<typeof fakeSentinel>

function fakeEnv({ supported = true }: { supported?: boolean } = {}) {
  const requests: Array<Deferred<FakeSentinel>> = []
  const request = vi.fn((type: 'screen') => {
    void type
    const pending = deferred<FakeSentinel>()
    requests.push(pending)
    return pending.promise
  })
  const visibilityListeners = new Set<() => void>()
  const document = {
    visibilityState: 'visible',
    addEventListener: (type: 'visibilitychange', listener: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.add(listener)
    },
    removeEventListener: (type: 'visibilitychange', listener: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.delete(listener)
    },
  }
  const states: WakeLockState[] = []
  const env = {
    navigator: supported ? { wakeLock: { request } } : {},
    document,
    onChange: (state: WakeLockState) => {
      states.push(state)
    },
  }
  // Sets the page's visibility and fires visibilitychange, as the browser does.
  const setVisibility = (state: 'visible' | 'hidden') => {
    document.visibilityState = state
    for (const listener of [...visibilityListeners]) listener()
  }
  return { env, request, requests, states, visibilityListeners, setVisibility }
}

// Enables and lets the first request resolve with a fresh sentinel.
async function enableAndHold(fake: ReturnType<typeof fakeEnv>, lock: ReturnType<typeof createWakeLock>) {
  const enabling = lock.enable()
  const sentinel = fakeSentinel()
  fake.requests[fake.requests.length - 1].resolve(sentinel)
  await enabling
  await flush()
  return sentinel
}

describe('createWakeLock', () => {
  it('starts off without requesting anything or reporting a change', () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    expect(lock.state).toBe('off')
    expect(fake.request).not.toHaveBeenCalled()
    expect(fake.states).toEqual([])
  })

  it('enable requests a screen lock and is held once the request resolves', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    const enabling = lock.enable()
    expect(fake.request).toHaveBeenCalledTimes(1)
    expect(fake.request).toHaveBeenCalledWith('screen')
    expect(lock.state).toBe('off')

    fake.requests[0].resolve(fakeSentinel())
    await enabling
    await flush()

    expect(lock.state).toBe('held')
    expect(fake.states).toEqual(['held'])
  })

  it('enable is unavailable when the browser has no wake lock API', async () => {
    const fake = fakeEnv({ supported: false })
    const lock = createWakeLock(fake.env)

    await lock.enable()

    expect(lock.state).toBe('unavailable')
    expect(fake.states).toEqual(['unavailable'])
  })

  it('a rejected request makes it unavailable without throwing to the caller', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    const enabling = lock.enable()
    fake.requests[0].reject(new Error('NotAllowedError'))

    await expect(enabling).resolves.toBeUndefined()
    await flush()
    expect(lock.state).toBe('unavailable')
    expect(fake.states).toEqual(['unavailable'])
  })

  it('enabling twice quickly makes only one request', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    const first = lock.enable()
    const second = lock.enable()
    expect(fake.request).toHaveBeenCalledTimes(1)

    fake.requests[0].resolve(fakeSentinel())
    await Promise.all([first, second])
    await flush()

    expect(fake.request).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('held')
    expect(fake.states).toEqual(['held'])
  })

  it('enabling again while held makes no new request', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    await enableAndHold(fake, lock)

    await lock.enable()

    expect(fake.request).toHaveBeenCalledTimes(1)
    expect(fake.states).toEqual(['held'])
  })

  it('onChange fires only when the state actually changes', async () => {
    const fake = fakeEnv({ supported: false })
    const lock = createWakeLock(fake.env)

    await lock.disable()
    await lock.enable()
    await lock.enable()
    await lock.disable()
    await lock.disable()

    expect(fake.states).toEqual(['unavailable', 'off'])
  })

  it('disable releases a held sentinel and turns off', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const sentinel = await enableAndHold(fake, lock)

    await lock.disable()
    await flush()

    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('off')
    // The release event that disable itself causes doesn't count as the browser dropping the lock.
    expect(fake.states).toEqual(['held', 'off'])
  })

  it('a request that resolves after disable is released right away and stays off', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    const enabling = lock.enable()
    await lock.disable()
    const late = fakeSentinel()
    fake.requests[0].resolve(late)
    await enabling
    await flush()

    expect(late.release).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('off')
    expect(fake.states).toEqual([])
  })

  it('becomes unavailable when the browser drops the sentinel while enabled', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const sentinel = await enableAndHold(fake, lock)

    fake.setVisibility('hidden')
    sentinel.drop()
    await flush()

    expect(lock.state).toBe('unavailable')
    expect(fake.states).toEqual(['held', 'unavailable'])
  })

  it('requests again when the page becomes visible after the lock was dropped, and is held on success', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const sentinel = await enableAndHold(fake, lock)
    fake.setVisibility('hidden')
    sentinel.drop()
    await flush()
    expect(fake.request).toHaveBeenCalledTimes(1)

    fake.setVisibility('visible')
    expect(fake.request).toHaveBeenCalledTimes(2)
    expect(fake.request).toHaveBeenLastCalledWith('screen')

    fake.requests[1].resolve(fakeSentinel())
    await flush()

    expect(lock.state).toBe('held')
    expect(fake.states).toEqual(['held', 'unavailable', 'held'])
  })

  it('becoming visible twice while a re-request is in flight makes only one request', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const sentinel = await enableAndHold(fake, lock)
    fake.setVisibility('hidden')
    sentinel.drop()
    await flush()

    fake.setVisibility('visible')
    fake.setVisibility('visible')

    expect(fake.request).toHaveBeenCalledTimes(2)
  })

  it('becoming hidden makes no request', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const sentinel = await enableAndHold(fake, lock)
    sentinel.drop()
    await flush()

    fake.setVisibility('hidden')

    expect(fake.request).toHaveBeenCalledTimes(1)
  })

  it('becoming visible while held makes no new request', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    await enableAndHold(fake, lock)

    fake.setVisibility('visible')

    expect(fake.request).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('held')
  })

  it('visibilitychange while never enabled does nothing', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    fake.setVisibility('hidden')
    fake.setVisibility('visible')
    await flush()

    expect(fake.request).not.toHaveBeenCalled()
    expect(lock.state).toBe('off')
    expect(fake.states).toEqual([])
  })

  it('visibilitychange after disable does nothing', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    await enableAndHold(fake, lock)
    await lock.disable()

    fake.setVisibility('hidden')
    fake.setVisibility('visible')
    await flush()

    expect(fake.request).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('off')
  })

  it('can be enabled again after disable', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    await enableAndHold(fake, lock)
    await lock.disable()

    await enableAndHold(fake, lock)

    expect(fake.request).toHaveBeenCalledTimes(2)
    expect(lock.state).toBe('held')
    expect(fake.states).toEqual(['held', 'off', 'held'])
  })

  it('disable from unavailable turns off', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const enabling = lock.enable()
    fake.requests[0].reject(new Error('NotAllowedError'))
    await enabling
    await flush()

    await lock.disable()

    expect(lock.state).toBe('off')
    expect(fake.states).toEqual(['unavailable', 'off'])
  })

  it('dispose releases a held sentinel, turns off and stops listening for visibilitychange', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)
    const sentinel = await enableAndHold(fake, lock)

    lock.dispose()
    await flush()

    expect(sentinel.release).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('off')
    expect(fake.states).toEqual(['held', 'off'])
    expect(fake.visibilityListeners.size).toBe(0)
  })

  it('a request that resolves after dispose is released right away and stays off', async () => {
    const fake = fakeEnv()
    const lock = createWakeLock(fake.env)

    const enabling = lock.enable()
    lock.dispose()
    const late = fakeSentinel()
    fake.requests[0].resolve(late)
    await enabling
    await flush()

    expect(late.release).toHaveBeenCalledTimes(1)
    expect(lock.state).toBe('off')
    expect(fake.states).toEqual([])
  })
})
