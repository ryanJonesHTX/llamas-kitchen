// Auth.js v5 handlers must be an App Router route handler; the rest of the
// app stays on the Pages Router.
import type { NextRequest } from 'next/server'
import { handlers } from '../../../../auth'
import { createResendSigninGuard } from '../../../../lib/signinRateLimit'

// Rate-limit magic-link emails so the sign-in form can't flood an inbox or
// burn the Resend quota.
const guard = createResendSigninGuard()

export const GET = handlers.GET
export const POST = (req: NextRequest) => guard(req, handlers.POST)
