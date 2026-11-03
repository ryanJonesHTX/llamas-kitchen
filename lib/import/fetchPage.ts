// Fetches one web page for recipe import. The URL comes from a user, so this
// is an SSRF boundary: every hop is validated from scratch, and the socket
// connects to the exact addresses that were checked (a custom `lookup`), so a
// second DNS answer can't swap in a private address.
// Server-only: node:http keeps it out of client bundles.
import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { isPublicAddress } from './address'

// One budget for the whole fetch, redirects included.
const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_REDIRECTS = 5

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml'])

// No cookies, no auth and no Accept-Encoding: the body arrives uncompressed.
const REQUEST_HEADERS = {
  'User-Agent': 'LlamasKitchenBot/1.0 (+https://food.ryanjones.dev)',
  Accept: 'text/html,application/xhtml+xml',
}

export type FetchPageErrorReason =
  | 'invalid-url'
  | 'blocked'
  | 'redirects'
  | 'timeout'
  | 'too-large'
  | 'not-html'
  | 'status'
  | 'network'

// Every expected failure. Messages never include response body content.
export class FetchPageError extends Error {
  readonly reason: FetchPageErrorReason

  constructor(reason: FetchPageErrorReason, message: string) {
    super(message)
    this.reason = reason
    this.name = 'FetchPageError'
  }
}

export type FetchedPage = { finalUrl: string; html: string }

type FetchOptions = {
  isAllowed: (address: string) => boolean
  // Tests serve from an ephemeral port; production only allows the default.
  allowAnyPort?: boolean
  timeoutMs?: number
}

export function fetchPage(url: string): Promise<FetchedPage> {
  return fetchPageWith(url, { isAllowed: isPublicAddress })
}

// The test seam: app code only calls fetchPage.
export async function fetchPageWith(
  url: string,
  { isAllowed, allowAnyPort = false, timeoutMs = FETCH_TIMEOUT_MS }: FetchOptions,
): Promise<FetchedPage> {
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    let target = checkedUrl(url, undefined, allowAnyPort)
    for (let redirects = 0; ; redirects++) {
      const response = await get(target, isAllowed, signal)
      try {
        if (!REDIRECT_STATUSES.has(response.statusCode!)) {
          return { finalUrl: target.href, html: await readHtml(response) }
        }
        if (redirects === MAX_REDIRECTS) {
          throw new FetchPageError('redirects', `More than ${MAX_REDIRECTS} redirects`)
        }
        const location = response.headers.location
        if (!location) throw new FetchPageError('status', `Redirect ${response.statusCode} without a Location`)
        target = checkedUrl(location, target, allowAnyPort)
      } finally {
        // Done with this hop either way; never read a redirect's body.
        response.destroy()
      }
    }
  } catch (error) {
    if (error instanceof FetchPageError) throw error
    // The abort surfaces as whatever the request or body stream was doing.
    if (signal.aborted) throw new FetchPageError('timeout', `No page within ${timeoutMs} ms`)
    throw new FetchPageError('network', `Couldn't load the page: ${(error as Error).message}`)
  }
}

// An http(s) URL on the scheme's default port, without credentials.
// `base` resolves a relative redirect Location.
function checkedUrl(input: string, base: URL | undefined, allowAnyPort: boolean): URL {
  const url = URL.parse(input, base)
  if (!url) throw new FetchPageError('invalid-url', 'Not a valid URL')
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchPageError('invalid-url', `Refused scheme ${url.protocol}`)
  }
  if (url.username || url.password) throw new FetchPageError('invalid-url', 'Refused credentials in URL')
  // URL clears an explicit default port, so any port left is non-default.
  if (url.port && !allowAnyPort) throw new FetchPageError('invalid-url', `Refused port ${url.port}`)
  return url
}

// One GET, resolving once the response headers arrive. Node skips `lookup`
// for an IP-literal host, so the literal is checked here instead.
function get(target: URL, isAllowed: (address: string) => boolean, signal: AbortSignal): Promise<IncomingMessage> {
  const host = target.hostname.startsWith('[') ? target.hostname.slice(1, -1) : target.hostname
  if (isIP(host) && !isAllowed(host)) throw new FetchPageError('blocked', `Refused address ${host}`)

  const request = target.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    request(target, {
      method: 'GET',
      headers: REQUEST_HEADERS,
      // A fresh connection per hop: a pooled socket wouldn't go through `lookup`.
      agent: false,
      lookup: checkedLookup(isAllowed),
      signal,
    })
      .on('response', resolve)
      .on('error', reject)
      .end()
  })
}

// Resolves every address for the host and refuses unless all of them are
// allowed, then hands the socket exactly those addresses. TLS still verifies
// the certificate against the hostname.
function checkedLookup(isAllowed: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
      if (error) return callback(error, '')
      let refused
      // A throw here would escape the request, so it becomes the request's error.
      try {
        refused = addresses.find(({ address }) => !isAllowed(address))
      } catch (checkError) {
        return callback(checkError as Error, '')
      }
      if (refused) {
        return callback(new FetchPageError('blocked', `Refused address ${refused.address} for ${hostname}`), '')
      }
      if (options.all) callback(null, addresses)
      else callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

// The body of a 2xx HTML response, decoded as UTF-8 (invalid bytes replaced).
async function readHtml(response: IncomingMessage): Promise<string> {
  const status = response.statusCode!
  if (status < 200 || status > 299) throw new FetchPageError('status', `Status ${status}`)
  const type = response.headers['content-type']?.split(';')[0].trim().toLowerCase()
  if (!type || !HTML_TYPES.has(type)) throw new FetchPageError('not-html', `Content-Type ${type ?? 'missing'}`)
  if (Number(response.headers['content-length']) > MAX_PAGE_BYTES) {
    throw new FetchPageError('too-large', `Content-Length over ${MAX_PAGE_BYTES} bytes`)
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of response as AsyncIterable<Buffer>) {
    size += chunk.length
    // The caller's finally destroys the response, aborting the download.
    if (size > MAX_PAGE_BYTES) throw new FetchPageError('too-large', `Body over ${MAX_PAGE_BYTES} bytes`)
    chunks.push(chunk)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
