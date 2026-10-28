import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <p className="text-base font-semibold text-primary">404</p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-text sm:text-5xl">
          Page not found
        </h1>
        <p className="mt-6 text-base leading-7 text-muted">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <div className="mt-10">
          <Link
            href="/"
            className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-on-primary shadow-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Go back home
          </Link>
        </div>
      </div>
    </div>
  )
}
