import { randomUUID } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'
import mongoose from 'mongoose'
import { connect, SESSIONS_COLLECTION, USERS_COLLECTION } from './db.ts'

// Auth.js's session cookie name over plain http (no __Secure- prefix).
const SESSION_COOKIE = 'authjs.session-token'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

type SignInAs = {
  email: string
  name?: string
  role: 'user' | 'admin'
}

// Signs the browser context in without going through a provider: writes a
// user and a database session the way @auth/mongodb-adapter stores them,
// then hands the browser the session cookie.
export async function signInAs(
  context: BrowserContext,
  { email, name, role }: SignInAs
): Promise<void> {
  const connection = await connect()
  const userId = new mongoose.Types.ObjectId()
  const sessionToken = randomUUID()

  await connection.collection(USERS_COLLECTION).insertOne({
    _id: userId,
    name: name ?? null,
    email,
    emailVerified: null,
    image: null,
    role,
  })
  await connection.collection(SESSIONS_COLLECTION).insertOne({
    sessionToken,
    userId,
    expires: new Date(Date.now() + ONE_DAY_MS),
  })

  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}
