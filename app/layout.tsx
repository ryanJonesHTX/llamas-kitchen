import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Open_Sans } from 'next/font/google'
import '../styles/globals.css'

// Same single weight the Pages _document loads from Google Fonts.
const openSans = Open_Sans({ subsets: ['latin'], weight: '400' })

export const metadata: Metadata = {
  title: 'Llamas Kitchen',
  icons: { icon: '/images/favicon.ico' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={openSans.className}>
      <body>{children}</body>
    </html>
  )
}
