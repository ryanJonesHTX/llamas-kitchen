import { expect, test } from '@playwright/test'
import { signInAs } from './auth.ts'
import { disconnect, reseed } from './db.ts'

test.beforeEach(async () => {
  await reseed()
})

test.afterAll(async () => {
  await disconnect()
})

for (const role of ['admin', 'user'] as const) {
  const email = `${role}@example.com`

  test(`signed in as ${role}, the session API returns the role`, async ({
    context,
    page,
  }) => {
    await signInAs(context, { email, role })

    const response = await page.request.get('/api/auth/session')

    expect(response.ok()).toBe(true)
    const session = await response.json()
    expect(session.user.email).toBe(email)
    expect(session.user.role).toBe(role)
  })
}
