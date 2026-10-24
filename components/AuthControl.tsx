'use client'

import { signIn, signOut, useSession } from 'next-auth/react'

const styles = {
  desktop: {
    signedIn: 'flex items-center gap-x-4',
    user: 'max-w-24 truncate text-sm text-muted xl:max-w-48',
    signIn: 'whitespace-nowrap text-sm font-semibold leading-6 text-text',
    signOut: 'shrink-0 whitespace-nowrap text-sm font-semibold leading-6 text-text',
  },
  mobile: {
    signedIn: 'flex min-h-11 items-center justify-between gap-x-4',
    user: 'truncate text-base text-muted',
    signOut: 'min-h-11 shrink-0 text-base font-semibold text-text',
    signIn:
      '-mx-3 flex min-h-11 w-full items-center rounded-md px-3 text-base font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft',
  },
}

// Sign in when signed out; the user's name (or email) and Sign out when
// signed in. Renders nothing while the session loads.
export default function AuthControl({ mobile = false }: { mobile?: boolean }) {
  const { data: session, status } = useSession()
  const style = mobile ? styles.mobile : styles.desktop

  if (status === 'loading') return null

  if (!session) {
    return (
      <button type="button" className={style.signIn} onClick={() => signIn()}>
        Sign in
      </button>
    )
  }

  // Long names are truncated on narrow desktops; the title shows them in full.
  const user = session.user.name ?? session.user.email
  return (
    <div className={style.signedIn}>
      <span className={style.user} title={user ?? undefined}>
        {user}
      </span>
      <button type="button" className={style.signOut} onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  )
}
