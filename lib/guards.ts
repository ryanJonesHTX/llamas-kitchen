import type { Session } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { auth } from '../auth'
import { isAdmin } from './roles'

// Server actions are public POST endpoints with no page to send the caller
// to, so their guards throw. Page guards redirect anonymous visitors to
// sign-in and bring them back to `path`.

function signInRedirect(path: string): never {
  redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(path)}`)
}

// For server actions: returns the signed-in session or throws.
export async function requireUserSession(): Promise<Session> {
  const session = await auth()
  if (!session) throw new Error('Forbidden: signed-in session required')
  return session
}

// For server actions: returns the admin session or throws.
export async function requireAdminSession(): Promise<Session> {
  const session = await auth()
  if (!session || !isAdmin(session)) throw new Error('Forbidden: admin session required')
  return session
}

// For pages any signed-in user may open.
export async function requireUserPage(path: string): Promise<Session> {
  const session = await auth()
  if (!session) signInRedirect(path)
  return session
}

// For admin-only pages: signed-in non-admins get a 404.
export async function requireAdminPage(path: string): Promise<Session> {
  const session = await auth()
  if (!session) signInRedirect(path)
  if (!isAdmin(session)) notFound()
  return session
}
