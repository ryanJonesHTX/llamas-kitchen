import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Resend from 'next-auth/providers/resend'
import { adapterWithRoles } from './lib/authAdapter'
import client from './lib/mongoClient'

// GitHub reads AUTH_GITHUB_ID/AUTH_GITHUB_SECRET and Resend reads
// AUTH_RESEND_KEY from the environment.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: adapterWithRoles(client, process.env.ADMIN_EMAILS),
  providers: [GitHub, Resend({ from: process.env.EMAIL_FROM })],
  callbacks: {
    // Explicit shape so the session token never reaches the client.
    session: ({ session, user }) => ({
      expires: session.expires,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
      },
    }),
  },
})
