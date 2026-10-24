import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Open_Sans } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { auth } from '../auth'
import SiteHeader from '../components/SiteHeader'
import { publishedSearchOptions } from '../lib/recipes/queries'
import '../styles/globals.css'

const openSans = Open_Sans({ subsets: ['latin'], weight: '400' })

export const metadata: Metadata = {
  title: 'Llamas Kitchen',
  icons: { icon: '/images/favicon.ico' },
}

// Seeding the provider from auth() means client components (SiteHeader,
// AuthControl) have the session on first render, with no loading state.
// auth() reads the request, so every page renders per request.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const searchOptions = await publishedSearchOptions()
  return (
    <html lang="en" className={openSans.className}>
      <body>
        <SessionProvider session={session}>
          <SiteHeader searchOptions={searchOptions} />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
