import type { Page } from '@playwright/test'
import { FLASH_EVENT } from '../../lib/flash.ts'

// A fake Web Share API and Clipboard API, installed before any page script
// runs, so Share button tests never open a real share sheet or touch the
// system clipboard.
//
// navigator.share:
// - 'resolve': resolves, as when the user picks a target.
// - 'abort': rejects with an AbortError, as when the user cancels the sheet.
// - 'error': rejects with a NotAllowedError, as a browser that refuses does.
// - 'absent': navigator has no share at all, as in most desktop browsers.
//
// navigator.clipboard.writeText:
// - 'resolve': resolves.
// - 'reject': rejects with a NotAllowedError, as when permission is denied.
// - 'absent': navigator has no clipboard at all (e.g. an insecure origin).
//
// Every share() call, every writeText() call and every FLASH_EVENT the page
// dispatches is logged on window.__share, read back with shareLog.
export type ShareMode = 'resolve' | 'abort' | 'error' | 'absent'
export type ClipboardMode = 'resolve' | 'reject' | 'absent'

export type ShareLog = {
  // The data passed to each share() call, in order.
  shares: unknown[]
  // The text passed to each clipboard.writeText() call, in order.
  writes: string[]
  // How many FLASH_EVENTs the page dispatched on window.
  flashEvents: number
}

type FakeWindow = Window & { __share: ShareLog }

export async function fakeShare(
  page: Page,
  { share, clipboard }: { share: ShareMode; clipboard: ClipboardMode }
): Promise<void> {
  await page.addInitScript(
    ({ share, clipboard, flashEvent }: { share: ShareMode; clipboard: ClipboardMode; flashEvent: string }) => {
      const log: ShareLog = { shares: [], writes: [], flashEvents: 0 }
      ;(window as unknown as FakeWindow).__share = log
      window.addEventListener(flashEvent, () => {
        log.flashEvents += 1
      })

      // Removed from the prototype too, so both `navigator.share` and
      // `'share' in navigator` say there is none.
      const remove = (name: 'share' | 'clipboard') => {
        delete (Navigator.prototype as unknown as Record<string, unknown>)[name]
        delete (navigator as unknown as Record<string, unknown>)[name]
      }

      if (share === 'absent') {
        remove('share')
      } else {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async (data: unknown) => {
            log.shares.push(data)
            if (share === 'abort') throw new DOMException('Share canceled', 'AbortError')
            if (share === 'error') throw new DOMException('Share refused', 'NotAllowedError')
          },
        })
      }

      if (clipboard === 'absent') {
        remove('clipboard')
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              log.writes.push(text)
              if (clipboard === 'reject') throw new DOMException('Write refused', 'NotAllowedError')
            },
          },
        })
      }
    },
    { share, clipboard, flashEvent: FLASH_EVENT }
  )
}

export async function shareLog(page: Page): Promise<ShareLog> {
  return page.evaluate(() => {
    const { shares, writes, flashEvents } = (window as unknown as FakeWindow).__share
    return { shares: [...shares], writes: [...writes], flashEvents }
  })
}

// Waits a full task, so the page has finished reacting to a settled share()
// or writeText() promise (its continuations are microtasks) before a test
// checks that something did not happen.
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)))
}
