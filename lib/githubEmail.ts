import type { GitHubEmail, GitHubProfile } from 'next-auth/providers/github'

const USER_URL = 'https://api.github.com/user'
const EMAILS_URL = 'https://api.github.com/user/emails'

// The one email GitHub has confirmed the user owns and marked as primary.
export function verifiedPrimaryEmail(
  emails: Pick<GitHubEmail, 'email' | 'primary' | 'verified'>[]
): string {
  const primary = emails.find((e) => e.primary && e.verified)
  if (!primary) throw new Error('GitHub account has no verified primary email')
  return primary.email
}

// Replaces the GitHub provider's userinfo request, which falls back to an
// unverified email when the public profile email is empty.
export async function githubUserinfoRequest({
  tokens,
}: {
  tokens: { access_token?: string }
}): Promise<GitHubProfile> {
  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    'User-Agent': 'authjs',
  }
  const [userRes, emailsRes] = await Promise.all([
    fetch(USER_URL, { headers }),
    fetch(EMAILS_URL, { headers }),
  ])
  if (!userRes.ok) throw new Error(`GitHub /user failed: ${userRes.status}`)
  if (!emailsRes.ok) {
    throw new Error(`GitHub /user/emails failed: ${emailsRes.status}`)
  }
  const profile: GitHubProfile = await userRes.json()
  return { ...profile, email: verifiedPrimaryEmail(await emailsRes.json()) }
}
