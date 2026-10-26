import { describe, expect, it } from 'vitest'
import { createKeyedLock } from '../../lib/keyedLock'

// Resolves on the next turns of the event loop, so overlapping runs would interleave.
const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('createKeyedLock', () => {
  it('runs work for the same key one at a time, in call order', async () => {
    const { withLock } = createKeyedLock()
    const events: string[] = []
    const work = (name: string) => async () => {
      events.push(`${name} start`)
      await tick()
      events.push(`${name} end`)
      return name
    }

    expect(await Promise.all([withLock('a', work('1')), withLock('a', work('2')), withLock('a', work('3'))])).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(events).toEqual(['1 start', '1 end', '2 start', '2 end', '3 start', '3 end'])
  })

  it('runs work for different keys concurrently', async () => {
    const { withLock } = createKeyedLock()
    const events: string[] = []
    const work = (name: string) => async () => {
      events.push(`${name} start`)
      await tick()
      events.push(`${name} end`)
    }

    await Promise.all([withLock('a', work('a')), withLock('b', work('b'))])

    expect(events).toEqual(['a start', 'b start', 'a end', 'b end'])
  })

  it('releases the lock when the work throws, and passes the error on', async () => {
    const { withLock } = createKeyedLock()
    const failing = withLock('a', async () => {
      throw new Error('boom')
    })
    const next = withLock('a', async () => 'ran')

    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('ran')
  })

  it('forgets a key once nothing is queued for it', async () => {
    const lock = createKeyedLock()
    const first = lock.withLock('a', tick)
    const second = lock.withLock('a', tick)
    expect(lock.size()).toBe(1)

    await first
    expect(lock.size()).toBe(1)
    await second
    expect(lock.size()).toBe(0)

    await expect(lock.withLock('b', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(lock.size()).toBe(0)
  })
})
