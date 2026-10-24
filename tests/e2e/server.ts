// Playwright webServer: starts an in-memory MongoDB, seeds it, then runs the
// production build with MONGODB_URI pointing at it. Next.js never overrides
// variables already set in process.env, so .env.local cannot take effect.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

// Answers the server's Cloudinary uploads; see fake-cloudinary.ts.
const fakeCloudinary = fileURLToPath(new URL('./fake-cloudinary.ts', import.meta.url))

// Fake auth values: tests sign in by seeding sessions (tests/e2e/auth.ts) and
// never reach GitHub or Resend. Plain http keeps the cookie unprefixed
// (authjs.session-token). Cloudinary values are fake too, and the preload
// answers uploads to the fake cloud name.
const e2eEnv = {
  NODE_OPTIONS: `--import ${fakeCloudinary}`,
  MONGODB_URI: E2E_MONGODB_URI,
  AUTH_SECRET: 'e2e-test-secret-not-for-production',
  AUTH_URL: `http://127.0.0.1:${APP_PORT}`,
  AUTH_GITHUB_ID: 'e2e-fake-github-id',
  AUTH_GITHUB_SECRET: 'e2e-fake-github-secret',
  AUTH_RESEND_KEY: 'e2e-fake-resend-key',
  EMAIL_FROM: 'e2e@example.com',
  ADMIN_EMAILS: '',
  CLOUDINARY_CLOUD_NAME: 'e2e-cloud',
  CLOUDINARY_API_KEY: 'e2e-fake-cloudinary-key',
  CLOUDINARY_API_SECRET: 'e2e-fake-cloudinary-secret',
}

const next = spawn(
  'node_modules/.bin/next',
  ['start', '-p', APP_PORT, '-H', '127.0.0.1'],
  { env: { ...process.env, ...e2eEnv }, stdio: 'inherit' }
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
