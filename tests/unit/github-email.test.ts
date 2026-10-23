import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubUserinfoRequest, verifiedPrimaryEmail } from '../../lib/githubEmail'

// The admin role is granted by email, so the email Auth.js gets from GitHub
// must be one GitHub has verified, never the editable public profile email.

describe('verifiedPrimaryEmail', () => {
  it('returns the email that is both primary and verified', () => {
    expect(
      verifiedPrimaryEmail([
        { email: 'other@example.com', primary: false, verified: true },
        { email: 'chef@example.com', primary: true, verified: true },
      ])
    ).toBe('chef@example.com')
  })

  it('throws when the primary email is unverified, even if another email is verified', () => {
    expect(() =>
      verifiedPrimaryEmail([
        { email: 'admin@example.com', primary: true, verified: false },
        { email: 'other@example.com', primary: false, verified: true },
      ])
    ).toThrow()
  })

  it('throws when no email is marked primary', () => {
    expect(() =>
      verifiedPrimaryEmail([
        { email: 'other@example.com', primary: false, verified: true },
      ])
    ).toThrow()
  })

  it('throws when GitHub returns no emails', () => {
    expect(() => verifiedPrimaryEmail([])).toThrow()
  })
})

describe('githubUserinfoRequest', () => {
  const USER_URL = 'https://api.github.com/user'
  const EMAILS_URL = 'https://api.github.com/user/emails'

  // Shape Auth.js passes to provider.userinfo.request.
  const context = {
    tokens: { access_token: 'gho_test_token' },
    provider: { userinfo: { url: USER_URL } },
  } as unknown as Parameters<typeof githubUserinfoRequest>[0]

  function stubGitHub(emailsResponse: Response) {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url) === USER_URL) {
        return Response.json({
          id: 42,
          login: 'mallory',
          email: 'admin@example.com',
        })
      }
      if (String(url) === EMAILS_URL) return emailsResponse
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the verified primary email, not the public email on the profile', async () => {
    stubGitHub(
      Response.json([
        { email: 'mallory@example.com', primary: true, verified: true },
      ])
    )

    const profile = await githubUserinfoRequest(context)

    expect(profile.email).toBe('mallory@example.com')
    expect(profile.login).toBe('mallory')
  })

  it('sends the access token as a bearer token to both endpoints', async () => {
    const fetchMock = stubGitHub(
      Response.json([
        { email: 'mallory@example.com', primary: true, verified: true },
      ])
    )

    await githubUserinfoRequest(context)

    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toEqual(expect.arrayContaining([USER_URL, EMAILS_URL]))
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer gho_test_token')
    }
  })

  it('throws when the emails request fails', async () => {
    stubGitHub(new Response('Forbidden', { status: 403 }))

    await expect(githubUserinfoRequest(context)).rejects.toThrow()
  })
})
