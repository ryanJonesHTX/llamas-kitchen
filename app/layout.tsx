import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { Fraunces, Inter } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { auth } from '../auth'
import SiteHeader from '../components/SiteHeader'
import Toaster from '../components/Toaster'
import { siteMetadata } from '../lib/metadata'
import { parseTheme, THEME_COOKIE } from '../lib/theme'
import '../styles/globals.css'

// globals.css maps these variables to Tailwind's font-sans and font-display.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({ subsets: ['latin'], axes: ['opsz'], variable: '--font-fraunces' })

// A function, so AUTH_URL is read per request rather than at build time.
export function generateMetadata(): Metadata {
  return siteMetadata()
}

// Seeding the provider from auth() means client components (SiteHeader,
// AuthControl) have the session on first render, with no loading state.
// auth() reads the request, so every page renders per request.
// The theme cookie sets data-theme for light or dark; system leaves it off
// so globals.css follows the OS setting.
// Every page renders inside the one <main>, which the skip link targets;
// tabIndex -1 lets the link move focus there.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable}`}
      data-theme={theme === 'system' ? undefined : theme}
    >
      <body className="font-sans">
        <a
          href="#main"
          className="fixed top-2 left-2 z-50 -translate-y-24 rounded-md bg-surface px-4 py-3 font-semibold text-text shadow-lg focus:translate-y-0"
        >
          Skip to content
        </a>
        <SessionProvider session={session}>
          <SiteHeader theme={theme} />
          <main id="main" tabIndex={-1} className="focus:outline-none">
            {children}
          </main>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  )
}
