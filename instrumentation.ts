import { missingEnv } from './lib/env'

// Next calls register() once when the server starts (not during next build).
// Throwing here makes next start fail instead of serving with a broken config.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const missing = missingEnv(process.env)
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}
