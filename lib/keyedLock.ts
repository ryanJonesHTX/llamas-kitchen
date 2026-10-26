// Runs work for the same key one at a time, in call order. In-process only:
// production is a single `next start` process, so that covers every request.
export function createKeyedLock() {
  // The last queued run per key; it never rejects, so the next run always starts.
  const tails = new Map<string, Promise<void>>()

  async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const run = (tails.get(key) ?? Promise.resolve()).then(work)
    const tail = run.then(
      () => {},
      () => {}
    )
    tails.set(key, tail)
    try {
      return await run
    } finally {
      // Nothing queued behind this run: drop the key so the map doesn't grow.
      if (tails.get(key) === tail) tails.delete(key)
    }
  }

  return { withLock, size: () => tails.size }
}
