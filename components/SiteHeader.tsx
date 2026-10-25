'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { useSession } from 'next-auth/react'
import AuthControl from './AuthControl'
import RecipeSearch from './RecipeSearch'
import ThemeToggle from './ThemeToggle'
import { NAV_LINKS } from '../lib/constants'
import type { RecipeSearchOption } from '../lib/recipes/queries'
import { isAdmin } from '../lib/roles'
import type { Theme } from '../lib/theme'

const logo = '/images/llama-icon.webp'

// Recipes covers the list and recipe pages, but not edit pages; the other
// links match their own path only.
function isActive(href: string, pathname: string) {
  if (href === '/recipes') {
    return (
      pathname === '/recipes' ||
      (pathname.startsWith('/recipes/') && !pathname.endsWith('/edit'))
    )
  }
  return pathname === href
}

// The visible wordmark names the link, so the logo is decorative.
function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="-m-1.5 flex shrink-0 items-center gap-x-2 rounded-md p-1.5">
      <Image alt="" className="h-10 w-10" src={logo} width={40} height={40} />
      <span className="whitespace-nowrap font-display text-xl font-semibold tracking-tight text-text">
        Llama's Kitchen
      </span>
    </Link>
  )
}

export default function SiteHeader({
  searchOptions,
  theme,
}: {
  searchOptions: RecipeSearchOption[]
  theme: Theme
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentTheme, setCurrentTheme] = useState(theme)
  const pathname = usePathname()
  // Hidden while the session loads, so signed-out visitors never see them.
  const session = useSession().data ?? null
  const links = NAV_LINKS.filter(
    (item) =>
      (session || !('signedInOnly' in item && item.signedInOnly)) &&
      (isAdmin(session) || !('adminOnly' in item && item.adminOnly))
  ).map((item) => ({ ...item, active: isActive(item.href, pathname) }))
  const closeMenu = () => setMobileMenuOpen(false)

  return (
    <header className="border-b border-border bg-surface print:hidden">
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center gap-x-6 px-4 sm:px-6 lg:px-8 xl:gap-x-10"
        aria-label="Global"
      >
        <Brand />
        <div className="hidden h-full gap-x-4 lg:flex xl:gap-x-8">
          {links.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`-mb-px inline-flex items-center whitespace-nowrap border-b-2 text-sm font-semibold ${
                item.active
                  ? 'border-primary text-text'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-x-3 lg:flex xl:gap-x-6">
          <div className="w-40 xl:w-64">
            <RecipeSearch options={searchOptions} />
          </div>
          <ThemeToggle theme={currentTheme} onChange={setCurrentTheme} />
          <AuthControl />
        </div>
        <button
          type="button"
          className="-mr-2 ml-auto inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-text lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="sr-only">Open main menu</span>
          <Bars3Icon className="h-6 w-6" aria-hidden="true" />
        </button>
      </nav>
      <Dialog
        as="div"
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        aria-label="Main menu"
      >
        <DialogPanel className="fixed inset-0 z-10 overflow-y-auto bg-surface px-4 sm:px-6 lg:hidden">
          <div className="flex h-16 items-center justify-between border-b border-border">
            <Brand onClick={closeMenu} />
            <button
              type="button"
              data-autofocus
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-text"
              onClick={closeMenu}
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-1 border-b border-border py-4">
            {links.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={closeMenu}
                aria-current={item.active ? 'page' : undefined}
                className={`-mx-3 flex min-h-11 items-center rounded-md border-l-2 pl-2.5 pr-3 text-base font-semibold ${
                  item.active
                    ? 'border-primary bg-primary-soft text-on-primary-soft'
                    : 'border-transparent text-muted hover:bg-primary-soft hover:text-on-primary-soft'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
          <div className="space-y-2 py-4">
            <AuthControl mobile onNavigate={closeMenu} />
            <div className="flex min-h-11 items-center justify-between">
              <span className="text-base text-muted">Theme</span>
              <ThemeToggle theme={currentTheme} onChange={setCurrentTheme} />
            </div>
            <div className="pt-2">
              <RecipeSearch options={searchOptions} />
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  )
}
