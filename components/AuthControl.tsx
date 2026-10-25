'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { signIn, signOut, useSession } from 'next-auth/react'

const MY_RECIPES = '/my-recipes'

const styles = {
  desktop: {
    signIn: 'whitespace-nowrap text-sm font-semibold leading-6 text-text',
    menuItem:
      'flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-text data-focus:bg-primary-soft data-focus:text-on-primary-soft aria-[current=page]:font-semibold',
  },
  mobile: {
    user: 'truncate py-2.5 text-base leading-6 text-muted',
    link: '-mx-3 flex min-h-11 items-center rounded-md border-l-2 pl-2.5 pr-3 text-base font-semibold',
    signIn:
      '-mx-3 flex min-h-11 w-full items-center rounded-md px-3 text-base font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft',
  },
}

// Sign in when signed out. Signed in, the user's name (or email) with My
// recipes and Sign out: a menu on desktop, a list in the mobile menu, where
// onNavigate closes it. Renders nothing while the session loads.
export default function AuthControl({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()

  if (status === 'loading') return null

  if (!session) {
    return (
      <button type="button" className={mobile ? styles.mobile.signIn : styles.desktop.signIn} onClick={() => signIn()}>
        Sign in
      </button>
    )
  }

  const user = session.user.name ?? session.user.email
  const current = pathname === MY_RECIPES ? 'page' : undefined

  if (mobile) {
    return (
      <div className="space-y-1">
        <p className={styles.mobile.user}>{user}</p>
        <Link
          href={MY_RECIPES}
          onClick={onNavigate}
          aria-current={current}
          className={`${styles.mobile.link} ${
            current
              ? 'border-primary bg-primary-soft text-on-primary-soft'
              : 'border-transparent text-muted hover:bg-primary-soft hover:text-on-primary-soft'
          }`}
        >
          My recipes
        </Link>
        <button type="button" className={styles.mobile.signIn} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  // Long names are truncated on narrow desktops; the title shows them in full.
  return (
    <Menu>
      <MenuButton
        title={user ?? undefined}
        className="inline-flex min-h-11 items-center gap-x-1 text-sm text-muted hover:text-text data-open:text-text"
      >
        <span className="max-w-20 truncate xl:max-w-36">{user}</span>
        <ChevronDownIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      </MenuButton>
      <MenuItems
        modal={false}
        anchor="bottom end"
        transition
        className="z-20 w-44 origin-top-right rounded-lg bg-surface p-1 shadow-lg ring-1 ring-border transition [--anchor-gap:0.5rem] focus:outline-hidden data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in motion-reduce:transition-none"
      >
        <MenuItem>
          <Link href={MY_RECIPES} aria-current={current} className={styles.desktop.menuItem}>
            My recipes
          </Link>
        </MenuItem>
        <MenuItem>
          <button type="button" className={styles.desktop.menuItem} onClick={() => signOut()}>
            Sign out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
