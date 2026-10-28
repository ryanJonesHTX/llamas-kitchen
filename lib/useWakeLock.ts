'use client'

import { useEffect, useRef, useState } from 'react'
import { createWakeLock, type WakeLockState } from './wakeLock'

// Holds a screen wake lock while `enabled`; unmounting releases it.
export function useWakeLock(enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>('off')
  const lockRef = useRef<ReturnType<typeof createWakeLock>>(null)

  useEffect(() => {
    const lock = createWakeLock({ navigator, document, onChange: setState })
    lockRef.current = lock
    return () => {
      lock.dispose()
      lockRef.current = null
    }
  }, [])

  useEffect(() => {
    const lock = lockRef.current!
    void (enabled ? lock.enable() : lock.disable())
  }, [enabled])

  return state
}
