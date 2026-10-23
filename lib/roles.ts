import type { Session } from 'next-auth'

export type Role = 'user' | 'admin'

// ADMIN_EMAILS is a comma-separated list, compared case-insensitively.
export function roleForEmail(
  email: string,
  adminEmails: string | undefined
): Role {
  const admins = (adminEmails ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.toLowerCase()) ? 'admin' : 'user'
}

export function isAdmin(session: Session | null): boolean {
  return session?.user.role === 'admin'
}
