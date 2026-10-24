import { beforeEach, describe, expect, it, vi } from 'vitest'

// lib/adminGuard.ts reads the session through the repo-root auth.ts, which
// pulls in next-auth (not loadable under Vitest), and calls next/navigation.
// Both are replaced at the module boundary.
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('../../auth', () => ({ auth }))

// Next's redirect() and notFound() never return: they throw an error whose
// digest the framework recognises. The mocks do the same.
const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};307;` })
  }),
  notFound: vi.fn(() => {
    throw Object.assign(new Error('NEXT_HTTP_ERROR_FALLBACK;404'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  }),
}))
vi.mock('next/navigation', () => ({ redirect, notFound }))

import { requireAdminPage, requireAdminSession } from '../../lib/adminGuard'

const sessionFor = (role: 'user' | 'admin') => ({
  expires: '2999-01-01T00:00:00.000Z',
  user: { id: `${role}-id`, name: role, email: `${role}@example.com`, image: null, role },
})
const adminSession = sessionFor('admin')
const userSession = sessionFor('user')

beforeEach(() => {
  auth.mockReset()
  redirect.mockClear()
  notFound.mockClear()
})

describe('requireAdminSession', () => {
  it('throws when there is no session', async () => {
    auth.mockResolvedValue(null)
    await expect(requireAdminSession()).rejects.toThrow()
  })

  it('throws for a signed-in user who is not an admin', async () => {
    auth.mockResolvedValue(userSession)
    await expect(requireAdminSession()).rejects.toThrow()
  })

  it('returns the session for an admin', async () => {
    auth.mockResolvedValue(adminSession)
    await expect(requireAdminSession()).resolves.toEqual(adminSession)
  })

  it('does not redirect or 404, since actions have no page to send', async () => {
    auth.mockResolvedValue(null)
    await expect(requireAdminSession()).rejects.toThrow()
    auth.mockResolvedValue(userSession)
    await expect(requireAdminSession()).rejects.toThrow()
    expect(redirect).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('requireAdminPage', () => {
  it('redirects a signed-out visitor to sign-in with the page as callbackUrl', async () => {
    auth.mockResolvedValue(null)
    await expect(requireAdminPage('/new')).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) })
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/api/auth/signin?callbackUrl=%2Fnew')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('URL-encodes the whole path, query string included, into callbackUrl', async () => {
    auth.mockResolvedValue(null)
    const path = '/recipes/beef stew/edit?from=a&b=c#top'
    await expect(requireAdminPage(path)).rejects.toThrow()
    expect(redirect).toHaveBeenCalledExactlyOnceWith(
      '/api/auth/signin?callbackUrl=%2Frecipes%2Fbeef%20stew%2Fedit%3Ffrom%3Da%26b%3Dc%23top'
    )
  })

  it('sends a signed-in non-admin to notFound', async () => {
    auth.mockResolvedValue(userSession)
    await expect(requireAdminPage('/new')).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    expect(notFound).toHaveBeenCalledOnce()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the session for an admin without redirecting or 404ing', async () => {
    auth.mockResolvedValue(adminSession)
    await expect(requireAdminPage('/new')).resolves.toEqual(adminSession)
    expect(redirect).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
  })
})
