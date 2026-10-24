import type { APIRequestContext, APIResponse, Page, Route } from '@playwright/test'

// A server-action POST as the browser sent it: Next routes it by the
// Next-Action header, so the URL, that header and the body are enough to send
// it again from anywhere.
export type CapturedAction = {
  url: string
  headers: Record<string, string>
  body: Buffer
}

// Everything Next reads to run an action. The cookie is left out on purpose:
// the replaying context's own session (or none) is what's under test.
const REPLAYED_HEADERS = ['next-action', 'content-type', 'accept', 'origin', 'next-router-state-tree']

// Runs `trigger`, captures the first server-action POST it causes and aborts
// it, so the action never runs and the replays start from the seed data.
export async function captureNextAction(page: Page, trigger: () => Promise<void>): Promise<CapturedAction> {
  let resolveCaptured!: (action: CapturedAction) => void
  const captured = new Promise<CapturedAction>((resolve) => {
    resolveCaptured = resolve
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const headers = await request.allHeaders()
    if (request.method() !== 'POST' || !headers['next-action']) return route.fallback()
    const body = request.postDataBuffer()
    if (!body) throw new Error('The server-action request has no body')
    resolveCaptured({
      url: request.url(),
      headers: Object.fromEntries(REPLAYED_HEADERS.filter((name) => headers[name]).map((name) => [name, headers[name]])),
      body,
    })
    await route.abort()
  }
  await page.route('**/*', handler)
  await trigger()
  const action = await captured
  await page.unroute('**/*', handler)
  return action
}

// Sends the captured action again with `api`'s cookies.
export function replayAction(api: APIRequestContext, action: CapturedAction): Promise<APIResponse> {
  return api.post(action.url, { headers: action.headers, data: action.body, maxRedirects: 0 })
}

// Records every server-action POST the page sends from now on.
export function recordNextActions(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) urls.push(request.url())
  })
  return urls
}
