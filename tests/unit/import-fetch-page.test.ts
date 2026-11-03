// Test seam (the implementation matches this exactly):
//
//   export function fetchPageWith(
//     url: string,
//     options: {
//       isAllowed: (address: string) => boolean
//       allowAnyPort?: boolean // default false: only the scheme's default port
//       timeoutMs?: number // default: the module's 10 s budget constant
//     },
//   ): Promise<{ finalUrl: string; html: string }>
//
//   export function fetchPage(url: string) {
//     return fetchPageWith(url, { isAllowed: isPublicAddress })
//   }
//
// `isAllowed` gets every address a hop would connect to: the bare IP for an
// IP-literal host (no brackets), or each address `dns.lookup(host, { all: true })`
// returned. App code only ever calls `fetchPage`.
//
// DNS goes through `node:dns` (`lookup`) or `node:dns/promises`, which this
// file fakes below, so no test touches the real network. Success paths use a
// local node:http server on 127.0.0.1 with an ephemeral port, hence
// `allowAnyPort: true` and an `isAllowed` that lets loopback through.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FetchPageError, fetchPage, fetchPageWith } from '../../lib/import/fetchPage'

// vi.mock factories are hoisted above the module body, so the fake lives in
// vi.hoisted.
const { fakeLookup, fakeLookupPromise } = vi.hoisted(() => {
  const FAKE_HOSTS: Record<string, { address: string; family: 4 | 6 }[]> = {
    localhost: [
      { address: '127.0.0.1', family: 4 },
      { address: '::1', family: 6 },
    ],
    'loopback.test': [{ address: '127.0.0.1', family: 4 }],
    'refused.test': [{ address: '10.0.0.1', family: 4 }],
    'loopback-and-private.test': [
      { address: '127.0.0.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    'public-then-private.test': [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    'private-then-public.test': [
      { address: '10.0.0.1', family: 4 },
      { address: '8.8.8.8', family: 4 },
    ],
  }

  function resolveFake(hostname: string, options: unknown) {
    const opts = (typeof options === 'number' ? { family: options } : (options ?? {})) as {
      all?: boolean
      family?: number
    }
    const entries = FAKE_HOSTS[hostname]
    if (!entries) {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: 'ENOTFOUND',
        hostname,
      })
    }
    const matching =
      opts.family === 4 || opts.family === 6
        ? entries.filter((entry) => entry.family === opts.family)
        : entries
    return { all: opts.all === true, matching }
  }

  function fakeLookup(hostname: string, options: unknown, callback?: (...args: any[]) => void) {
    const cb = (typeof options === 'function' ? options : callback) as (...args: any[]) => void
    const opts = typeof options === 'function' ? {} : options
    process.nextTick(() => {
      let resolved: ReturnType<typeof resolveFake>
      try {
        resolved = resolveFake(hostname, opts)
      } catch (error) {
        cb(error)
        return
      }
      const { all, matching } = resolved
      if (all) cb(null, matching)
      else cb(null, matching[0].address, matching[0].family)
    })
  }

  async function fakeLookupPromise(hostname: string, options?: unknown) {
    const { all, matching } = resolveFake(hostname, options)
    return all ? matching : matching[0]
  }

  return { fakeLookup, fakeLookupPromise }
})

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>()
  const promises = { ...actual.promises, lookup: fakeLookupPromise }
  return {
    ...actual,
    default: { ...actual, lookup: fakeLookup, promises },
    lookup: fakeLookup,
    promises,
  }
})

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>()
  return {
    ...actual,
    default: { ...actual, lookup: fakeLookupPromise },
    lookup: fakeLookupPromise,
  }
})

const MAX_BYTES = 3 * 1024 * 1024
const HTML = 'text/html; charset=utf-8'

const allowLoopbackV4 = { isAllowed: (ip: string) => ip === '127.0.0.1', allowAnyPort: true }

type TestServer = { port: number; origin: string; requests: IncomingMessage[] }

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        }),
    ),
  )
})

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<TestServer> {
  const requests: IncomingMessage[] = []
  const server = createServer((req, res) => {
    requests.push(req)
    handler(req, res)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { port, origin: `http://127.0.0.1:${port}`, requests }
}

function sendHtml(res: ServerResponse, body: string | Buffer, status = 200) {
  res.writeHead(status, { 'Content-Type': HTML })
  res.end(body)
}

// /r/<n> redirects to /r/<n+1> until n reaches `length`, then serves a page.
// Hops cycle through every redirect status and alternate relative and
// absolute Locations.
function redirectChain(length: number) {
  const statuses = [301, 302, 303, 307, 308]
  return (req: IncomingMessage, res: ServerResponse) => {
    const n = Number(req.url!.split('/')[2])
    if (n < length) {
      const next = `/r/${n + 1}`
      const location = n % 2 === 0 ? next : `http://${req.headers.host}${next}`
      res.writeHead(statuses[n % statuses.length], { Location: location })
      res.end()
      return
    }
    sendHtml(res, `<p>hop ${n}</p>`)
  }
}

async function failure(promise: Promise<unknown>): Promise<FetchPageError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(FetchPageError)
    return error as FetchPageError
  }
  throw new Error('expected the fetch to fail')
}

describe('fetchPage URL checks', () => {
  it.each(['ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi'])(
    'refuses the non-http scheme in %s',
    async (url) => {
      expect((await failure(fetchPage(url))).reason).toBe('invalid-url')
    },
  )

  it.each([
    'http://user:pass@example.com/',
    'http://user@example.com/',
    'https://:pass@example.com/',
  ])('refuses credentials in %s', async (url) => {
    expect((await failure(fetchPage(url))).reason).toBe('invalid-url')
  })

  it.each([
    'http://example.com:8080/',
    'https://example.com:8443/',
    'http://example.com:443/',
    'https://example.com:80/',
  ])('refuses the non-default port in %s', async (url) => {
    expect((await failure(fetchPage(url))).reason).toBe('invalid-url')
  })

  it('treats an explicit default port as the default, so the address check decides', async () => {
    expect((await failure(fetchPage('http://127.0.0.1:80/'))).reason).toBe('blocked')
    expect((await failure(fetchPage('https://127.0.0.1:443/'))).reason).toBe('blocked')
  })

  it.each(['', 'not a url', 'http://', '//example.com/', 'http://exa mple.com/'])(
    'refuses the malformed URL %j',
    async (url) => {
      expect((await failure(fetchPage(url))).reason).toBe('invalid-url')
    },
  )
})

describe('fetchPage address checks', () => {
  it.each([
    'http://127.0.0.1/',
    'https://127.0.0.1/',
    'http://localhost/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://10.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://refused.test/',
  ])('refuses %s as blocked', async (url) => {
    expect((await failure(fetchPage(url))).reason).toBe('blocked')
  })

  it.each(['http://public-then-private.test/', 'http://private-then-public.test/'])(
    'refuses %s, whose lookup returns one public and one private address',
    async (url) => {
      expect((await failure(fetchPage(url))).reason).toBe('blocked')
    },
  )

  it('refuses a refused IP literal before connecting', async () => {
    const server = await startServer((_req, res) => sendHtml(res, 'reached'))
    const isAllowed = vi.fn<(address: string) => boolean>(() => false)
    const error = await failure(
      fetchPageWith(`${server.origin}/`, { isAllowed, allowAnyPort: true }),
    )
    expect(error.reason).toBe('blocked')
    expect(isAllowed).toHaveBeenCalledWith('127.0.0.1')
    expect(server.requests).toHaveLength(0)
  })

  it('refuses a hostname unless every address it resolves to is allowed, before connecting', async () => {
    const server = await startServer((_req, res) => sendHtml(res, 'reached'))
    const error = await failure(
      fetchPageWith(`http://loopback-and-private.test:${server.port}/`, allowLoopbackV4),
    )
    expect(error.reason).toBe('blocked')
    expect(server.requests).toHaveLength(0)
  })

  it('connects to the address it checked, sending the hostname as Host', async () => {
    // loopback.test exists only in the faked lookup, so reaching the server
    // proves the socket used the checked result rather than a second lookup.
    const server = await startServer((_req, res) => sendHtml(res, '<p>hi</p>'))
    const page = await fetchPageWith(`http://loopback.test:${server.port}/`, allowLoopbackV4)
    expect(page.html).toBe('<p>hi</p>')
    expect(server.requests[0].headers.host).toBe(`loopback.test:${server.port}`)
  })

  it('reports a hostname that does not resolve as a network error', async () => {
    expect((await failure(fetchPage('http://nowhere.test/'))).reason).toBe('network')
  })

  it('reports a refused connection as a network error', async () => {
    const server = await startServer(() => {})
    const { port } = server
    await new Promise<void>((resolve) => {
      const closing = servers.pop()!
      closing.close(() => resolve())
    })
    const error = await failure(fetchPageWith(`http://127.0.0.1:${port}/`, allowLoopbackV4))
    expect(error.reason).toBe('network')
  })
})

describe('fetchPage responses (loopback allowed through the seam)', () => {
  it('returns the final URL and the HTML of a 200 page', async () => {
    const server = await startServer((_req, res) => sendHtml(res, '<h1>Soup</h1>'))
    expect(await fetchPageWith(`${server.origin}/soup`, allowLoopbackV4)).toEqual({
      finalUrl: `${server.origin}/soup`,
      html: '<h1>Soup</h1>',
    })
  })

  it('decodes the body as UTF-8, replacing invalid bytes instead of failing', async () => {
    const body = Buffer.concat([Buffer.from('Crème brûlée '), Buffer.from([0xff])])
    const server = await startServer((_req, res) => sendHtml(res, body))
    const page = await fetchPageWith(`${server.origin}/`, allowLoopbackV4)
    expect(page.html).toBe('Crème brûlée �')
  })

  it.each(['text/html', 'text/html; charset=utf-8', 'application/xhtml+xml'])(
    'accepts Content-Type %s',
    async (contentType) => {
      const server = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': contentType })
        res.end('<p>ok</p>')
      })
      expect((await fetchPageWith(`${server.origin}/`, allowLoopbackV4)).html).toBe('<p>ok</p>')
    },
  )

  it.each(['application/json', 'text/plain', undefined])(
    'refuses Content-Type %s as not-html',
    async (contentType) => {
      const server = await startServer((_req, res) => {
        res.writeHead(200, contentType ? { 'Content-Type': contentType } : {})
        res.end('{"secret":"BODY-CONTENT-123"}')
      })
      const error = await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))
      expect(error.reason).toBe('not-html')
      expect(error.message).not.toContain('BODY-CONTENT-123')
    },
  )

  it.each([404, 500])('refuses status %i, keeping the body out of the error', async (status) => {
    const server = await startServer((_req, res) => sendHtml(res, 'BODY-CONTENT-123', status))
    const error = await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))
    expect(error.reason).toBe('status')
    expect(error.message).not.toContain('BODY-CONTENT-123')
  })

  it('sends the bot User-Agent and an HTML Accept, and no cookies, auth or Accept-Encoding', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/end', 'Set-Cookie': 'session=abc' })
        res.end()
        return
      }
      sendHtml(res, '<p>end</p>')
    })
    await fetchPageWith(`${server.origin}/start`, allowLoopbackV4)
    expect(server.requests).toHaveLength(2)
    for (const { headers } of server.requests) {
      expect(headers['user-agent']).toMatch(/^LlamasKitchenBot\/1\.0/)
      expect(headers.accept).toBe('text/html,application/xhtml+xml')
      expect(headers.cookie).toBeUndefined()
      expect(headers.authorization).toBeUndefined()
      expect(headers['accept-encoding']).toBeUndefined()
    }
  })
})

describe('fetchPage redirects (loopback allowed through the seam)', () => {
  it('follows a chain of 5 redirects with GET and returns the last URL', async () => {
    const server = await startServer(redirectChain(5))
    const page = await fetchPageWith(`${server.origin}/r/0`, allowLoopbackV4)
    expect(page).toEqual({ finalUrl: `${server.origin}/r/5`, html: '<p>hop 5</p>' })
    expect(server.requests.map((req) => req.url)).toEqual([
      '/r/0',
      '/r/1',
      '/r/2',
      '/r/3',
      '/r/4',
      '/r/5',
    ])
    expect(server.requests.every((req) => req.method === 'GET')).toBe(true)
  })

  it('refuses a 6th redirect without following it', async () => {
    const server = await startServer(redirectChain(6))
    const error = await failure(fetchPageWith(`${server.origin}/r/0`, allowLoopbackV4))
    expect(error.reason).toBe('redirects')
    expect(server.requests.map((req) => req.url)).not.toContain('/r/6')
  })

  it('refuses a 3xx response without a Location header as status', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(302)
      res.end()
    })
    const error = await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))
    expect(error.reason).toBe('status')
    expect(server.requests).toHaveLength(1)
  })

  it('refuses a redirect to a 404 as status', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(301, { Location: '/missing' })
        res.end()
        return
      }
      sendHtml(res, 'gone', 404)
    })
    expect((await failure(fetchPageWith(`${server.origin}/start`, allowLoopbackV4))).reason).toBe(
      'status',
    )
  })

  it('refuses a redirect to an IP literal the policy refuses', async () => {
    // The server listens on 127.0.0.1 only: following to ::1 would fail as
    // `network`, so `blocked` shows the address was checked first.
    const server = await startServer((_req, res) => {
      res.writeHead(302, { Location: `http://[::1]:${(res.socket!.address() as AddressInfo).port}/` })
      res.end()
    })
    expect((await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))).reason).toBe(
      'blocked',
    )
  })

  it('refuses a redirect to a hostname that resolves to a refused address', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(302, { Location: 'http://refused.test/' })
      res.end()
    })
    expect((await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))).reason).toBe(
      'blocked',
    )
  })

  it.each(['ftp://127.0.0.1/recipe', 'javascript:alert(1)', 'file:///etc/passwd'])(
    'refuses a redirect to the non-http URL %s',
    async (location) => {
      const server = await startServer((_req, res) => {
        res.writeHead(302, { Location: location })
        res.end()
      })
      const error = await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))
      expect(error.reason).toBe('invalid-url')
      expect(server.requests).toHaveLength(1)
    },
  )

  it('refuses a redirect to a URL with credentials', async () => {
    const server = await startServer((req, res) => {
      res.writeHead(302, { Location: `http://user:pass@${req.headers.host}/next` })
      res.end()
    })
    const error = await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))
    expect(error.reason).toBe('invalid-url')
    expect(server.requests).toHaveLength(1)
  })
})

describe('fetchPage limits (loopback allowed through the seam)', () => {
  it('times out a server that never answers', async () => {
    const server = await startServer(() => {})
    const error = await failure(
      fetchPageWith(`${server.origin}/`, { ...allowLoopbackV4, timeoutMs: 200 }),
    )
    expect(error.reason).toBe('timeout')
  })

  it('times out a body that stalls after the headers', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': HTML })
      res.write('<p>first part')
    })
    const error = await failure(
      fetchPageWith(`${server.origin}/`, { ...allowLoopbackV4, timeoutMs: 200 }),
    )
    expect(error.reason).toBe('timeout')
  })

  it('spends one time budget across the whole redirect chain', async () => {
    // Each hop takes 150 ms, well inside the 400 ms budget on its own; the
    // five-hop chain doesn't fit.
    const chain = redirectChain(5)
    const server = await startServer((req, res) => {
      setTimeout(() => chain(req, res), 150)
    })
    const error = await failure(
      fetchPageWith(`${server.origin}/r/0`, { ...allowLoopbackV4, timeoutMs: 400 }),
    )
    expect(error.reason).toBe('timeout')
  })

  it('accepts a body of exactly 3 MB', async () => {
    const server = await startServer((_req, res) => sendHtml(res, Buffer.alloc(MAX_BYTES, 'a')))
    const page = await fetchPageWith(`${server.origin}/`, allowLoopbackV4)
    expect(page.html).toHaveLength(MAX_BYTES)
  })

  it('refuses a body one byte over 3 MB sent without Content-Length', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': HTML })
      res.write(Buffer.alloc(MAX_BYTES, 'a'))
      res.end('a')
    })
    expect((await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))).reason).toBe(
      'too-large',
    )
  })

  it('aborts an endless body without Content-Length once it passes 3 MB', async () => {
    let connectionClosed!: () => void
    const closed = new Promise<void>((resolve) => (connectionClosed = resolve))
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': HTML })
      const chunk = Buffer.alloc(64 * 1024, 'a')
      const pump = () => {
        let more = true
        while (more && !res.destroyed) more = res.write(chunk)
      }
      res.on('drain', pump)
      res.on('close', connectionClosed)
      pump()
    })
    // The full 10 s budget, so only the fetcher aborting closes the connection
    // before the test's own 5 s limit.
    const error = await failure(fetchPageWith(`${server.origin}/`, allowLoopbackV4))
    expect(error.reason).toBe('too-large')
    await closed
  })

  it('refuses early when Content-Length says more than 3 MB', async () => {
    // The body never arrives, so only an early refusal beats the timeout.
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': HTML, 'Content-Length': String(MAX_BYTES + 1) })
      res.write('<p>start')
    })
    const error = await failure(
      fetchPageWith(`${server.origin}/`, { ...allowLoopbackV4, timeoutMs: 2000 }),
    )
    expect(error.reason).toBe('too-large')
  })
})
