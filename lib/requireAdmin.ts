import type {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  NextApiRequest,
  NextApiResponse,
} from 'next'
import type { Session } from 'next-auth'
import { auth } from '../auth'
import { isAdmin } from './roles'

// Returns the admin session, or sends 401 (no session) / 403 (not an admin)
// and returns null.
export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await auth(req, res)
  if (!session) {
    res.status(401).json({ success: false })
    return null
  }
  if (!isAdmin(session)) {
    res.status(403).json({ success: false })
    return null
  }
  return session
}

// getServerSideProps for admin-only pages: anonymous visitors are redirected
// to sign-in and come back here; signed-in non-admins get a 404.
export async function requireAdminPage(
  context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<Record<string, never>>> {
  const session = await auth(context)
  if (!session) {
    return {
      redirect: {
        destination: `/api/auth/signin?callbackUrl=${encodeURIComponent(context.resolvedUrl)}`,
        permanent: false,
      },
    }
  }
  if (!isAdmin(session)) return { notFound: true }
  return { props: {} }
}
