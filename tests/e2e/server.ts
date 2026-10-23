// Playwright webServer: starts an in-memory MongoDB, seeds it, then runs the
// production build with MONGODB_URI pointing at it. Next.js never overrides
// variables already set in process.env, so .env.local cannot take effect.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { disconnect, E2E_MONGODB_URI, reseed } from './db.ts'
import { E2E_MONGODB_PORT } from './fixtures.ts'

const APP_PORT = '3100'

if (!existsSync('.next/BUILD_ID')) {
  throw new Error('No production build found. Run `npm run build` first.')
}

// portGeneration: false makes startup fail if the port is busy, instead of
// silently moving to another port and leaving reseed() pointed at whatever
// is listening on E2E_MONGODB_PORT.
const mongo = await MongoMemoryServer.create({
  instance: { ip: '127.0.0.1', port: E2E_MONGODB_PORT, portGeneration: false },
})
await reseed()
await disconnect()

const next = spawn(
  'node_modules/.bin/next',
  ['start', '-p', APP_PORT, '-H', '127.0.0.1'],
  { env: { ...process.env, MONGODB_URI: E2E_MONGODB_URI }, stdio: 'inherit' }
)

let stopping = false
async function shutdown(code: number) {
  if (stopping) return
  stopping = true
  next.kill('SIGTERM')
  await mongo.stop()
  process.exit(code)
}

next.on('exit', (code) => shutdown(code ?? 1))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
