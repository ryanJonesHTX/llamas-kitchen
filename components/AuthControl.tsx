'use client'

import { signIn, signOut, useSession } from 'next-auth/react'

const styles = {
  desktop: {
    signedIn: 'flex items-center gap-x-4',
    user: 'text-sm text-gray-700',
    signIn: 'text-sm font-semibold leading-6 text-gray-900',
    signOut: 'text-sm font-semibold leading-6 text-gray-900',
  },
  mobile: {
    signedIn: '-mx-3 flex items-center justify-between py-2 px-3',
    user: 'text-base leading-7 text-gray-700',
    signOut: 'text-base font-semibold leading-7 text-gray-900',
    signIn:
      '-mx-3 block rounded-lg py-2 px-3 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-400/10',
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

  return (
    <div className={style.signedIn}>
      <span className={style.user}>
        {session.user.name ?? session.user.email}
      </span>
      <button type="button" className={style.signOut} onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  )
}
