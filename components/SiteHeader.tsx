'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { useSession } from 'next-auth/react'
import AuthControl from './AuthControl'
import RecipeSearch from './RecipeSearch'
import { isAdmin } from '../lib/roles'
import { NAV_LINKS } from '../lib/constants'
import type { RecipeSearchOption } from '../lib/recipes/queries'

const logo =
  'https://res.cloudinary.com/dhcbfbegu/image/upload/v1676184096/llama-icon_wdbpep.webp'

export default function SiteHeader({
  searchOptions,
}: {
  searchOptions: RecipeSearchOption[]
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Hidden while the session loads, so non-admins never see admin links.
  const admin = isAdmin(useSession().data)
  const links = NAV_LINKS.filter(
    (item) => admin || !('adminOnly' in item && item.adminOnly)
  )

  return (
    <header className="relative px-6 pt-6 lg:pl-8 lg:pr-0">
      <div className="mx-auto max-w-7xl">
        <div className="lg:w-full">
          <nav
            className="flex items-center justify-between sm:h-10 lg:justify-start"
            aria-label="Global"
          >
            <Link href="/" className="-m-1.5 p-1.5">
              <span className="sr-only">Llama's Kitchen</span>
              <Image
                alt="Llama's Kitchen"
                className="h-12 w-auto"
                src={logo}
                width={48}
                height={48}
              />
            </Link>
            <h3 className="-ml-3 font-display text-xl font-bold leading-6 text-text lg:hidden">
              Llama's Kitchen
            </h3>
            <button
              type="button"
              className="-m-2.5 rounded-md p-2.5 text-muted lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
            <div className="hidden lg:ml-12 lg:block lg:space-x-14">
              {links.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-sm font-semibold leading-6 text-text"
                >
                  {item.name}
                </Link>
              ))}
            </div>
            <div className="hidden lg:flex lg:mr-8 lg:ml-auto">
              <RecipeSearch options={searchOptions} />
            </div>
            <div className="hidden lg:flex lg:items-center lg:mr-8">
              <AuthControl />
            </div>
          </nav>
          <Dialog
            as="div"
            open={mobileMenuOpen}
            onClose={setMobileMenuOpen}
            aria-label="Main menu"
          >
            <DialogPanel className="fixed inset-0 z-10 overflow-y-auto bg-bg px-6 py-6 lg:hidden">
              <div className="flex flex-row-reverse items-center justify-between">
                <button
                  type="button"
                  data-autofocus
                  className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-muted"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="sr-only">Close menu</span>
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
                <Link href="/" className="-m-1.5 p-1.5">
                  <span className="sr-only">Llama's Kitchen</span>
                  <Image
                    className="h-12"
                    src={logo}
                    alt="Llama's Kitchen"
                    width={42}
                    height={42}
                  />
                </Link>
              </div>
              <div className="mt-6 space-y-2">
                {links.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="-mx-3 block rounded-lg py-2 px-3 text-base font-semibold leading-7 text-text hover:bg-primary-soft"
                  >
                    {item.name}
                  </Link>
                ))}
                <AuthControl mobile />
                <div className="flex flex-1 px-2 lg:hidden">
                  <RecipeSearch options={searchOptions} />
                </div>
              </div>
            </DialogPanel>
          </Dialog>
        </div>
      </div>
    </header>
  )
}
