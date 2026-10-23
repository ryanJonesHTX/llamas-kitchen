import Link from 'next/link'
import { useSession } from 'next-auth/react'
import SiteHeader from './SiteHeader'
import { isAdmin } from '../lib/roles'

export default function Landing({ searchOptions }) {
  // Hidden while the session loads, so non-admins never see admin links.
  const admin = isAdmin(useSession().data)

  return (
    <div className="relative bg-white">
      <div className="mx-auto max-w-7xl">
        <div className="relative z-10 lg:w-full lg:h-full lg:max-w-2xl">
          <svg
            className="absolute inset-y-0 right-8 hidden h-full w-80 translate-x-1/2 transform fill-white lg:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon points="0,0 90,0 50,100 0,100" />
          </svg>

          <SiteHeader searchOptions={searchOptions} />

          <div className="relative py-32 px-6 sm:py-40 lg:py-56 lg:px-8 lg:pr-0">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Llama's Kitchen
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                A collection of recipes acquired from friends, family and
                discovered as we go along! Please feel free to add your personal favorites for us to try.
              </p>
              <div className="mt-10 flex items-center gap-x-6">
                <Link
                  href="/recipes"
                  className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-base font-semibold leading-7 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  All Recipes
                </Link>
                {admin && (
                  <Link
                    href="/new"
                    className="text-base font-semibold leading-7 text-gray-900"
                  >
                    Add Recipe <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
        <img
          className="aspect-4/3 object-cover lg:aspect-auto lg:h-full lg:w-full"
          src="https://res.cloudinary.com/dhcbfbegu/image/upload/v1676182454/llama_rmoylj.webp"
          alt="Llama's Kitchen"
        />
      </div>
    </div>
  )
}
