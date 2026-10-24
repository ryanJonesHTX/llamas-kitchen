import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { Fraunces, Inter } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { auth } from '../auth'
import SiteHeader from '../components/SiteHeader'
import Toaster from '../components/Toaster'
import { publishedSearchOptions } from '../lib/recipes/queries'
import { parseTheme, THEME_COOKIE } from '../lib/theme'
import '../styles/globals.css'

// globals.css maps these variables to Tailwind's font-sans and font-display.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({ subsets: ['latin'], axes: ['opsz'], variable: '--font-fraunces' })

export const metadata: Metadata = {
  title: 'Llamas Kitchen',
  icons: { icon: '/images/favicon.ico' },
}

// Seeding the provider from auth() means client components (SiteHeader,
// AuthControl) have the session on first render, with no loading state.
// auth() reads the request, so every page renders per request.
// The theme cookie sets data-theme for light or dark; system leaves it off
// so globals.css follows the OS setting.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const searchOptions = await publishedSearchOptions()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable}`}
      data-theme={theme === 'system' ? undefined : theme}
    >
      <body className="font-sans">
        <SessionProvider session={session}>
          <SiteHeader searchOptions={searchOptions} theme={theme} />
          {children}
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  )
}
