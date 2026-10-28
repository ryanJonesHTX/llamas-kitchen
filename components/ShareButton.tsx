'use client'

import { ShareIcon } from '@heroicons/react/24/outline'
import { FLASH_EVENT, flashCookie, type FlashKey } from '../lib/flash'

// Shows the toast on this page (components/Toaster.tsx), which doesn't navigate.
function flash(key: FlashKey) {
  document.cookie = flashCookie(key)
  window.dispatchEvent(new Event(FLASH_EVENT))
}

async function copyLink(url: string) {
  if (!('clipboard' in navigator)) return flash('copyFailed')
  try {
    await navigator.clipboard.writeText(url)
    flash('linkCopied')
  } catch {
    flash('copyFailed')
  }
}

// Opens the native share sheet where there is one; cancelling it does
// nothing. Otherwise, or if sharing fails, copies the link and says so.
async function share(title: string, url: string) {
  if ('share' in navigator) {
    try {
      await navigator.share({ title, url })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  await copyLink(url)
}

// `url` is the recipe's absolute link, built on the server (recipeShareUrl).
export default function ShareButton({ title, url }: { title: string; url: string }) {
  return (
    <button
      type="button"
      onClick={() => share(title, url)}
      className="inline-flex min-h-11 items-center gap-x-1.5 rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft"
    >
      <ShareIcon className="size-4 shrink-0" aria-hidden="true" />
      Share
    </button>
  )
}
