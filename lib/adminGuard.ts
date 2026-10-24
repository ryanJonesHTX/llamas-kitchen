import type { Session } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { auth } from '../auth'
import { isAdmin } from './roles'

// For server actions, which are public POST endpoints with no page to send
// the caller to: returns the admin session or throws.
export async function requireAdminSession(): Promise<Session> {
  const session = await auth()
  if (!session || !isAdmin(session)) throw new Error('Forbidden: admin session required')
  return session
}

// For admin-only App Router pages: anonymous visitors are redirected to
// sign-in and come back to `path`; signed-in non-admins get a 404.
export async function requireAdminPage(path: string): Promise<Session> {
  const session = await auth()
  if (!session) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(path)}`)
  if (!isAdmin(session)) notFound()
  return session
}
