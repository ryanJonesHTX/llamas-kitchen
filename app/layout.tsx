import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Open_Sans } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { auth } from '../auth'
import '../styles/globals.css'

// Same single weight the Pages _document loads from Google Fonts.
const openSans = Open_Sans({ subsets: ['latin'], weight: '400' })

export const metadata: Metadata = {
  title: 'Llamas Kitchen',
  icons: { icon: '/images/favicon.ico' },
}

// Seeding the provider from auth() means client components (SiteHeader,
// AuthControl) have the session on first render, with no loading state.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  return (
    <html lang="en" className={openSans.className}>
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  )
}
