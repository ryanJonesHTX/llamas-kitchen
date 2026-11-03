// Test-only Node preload for `next start` (loaded by tests/e2e/server.ts via
// NODE_OPTIONS=--import). It serves a fake recipe site for the importer
// (lib/import/fetchPage.ts) while every one of fetchPage's checks still runs.
//
// fetchPage refuses loopback addresses and non-default ports, and resolves
// names through its own checked `lookup`, so wrapping fetch can't reach it.
// Instead:
// - a node:http server on 127.0.0.1 (an ephemeral port) serves the pages;
// - dns.lookup answers FAKE_RECIPE_ADDRESS (public) for FAKE_RECIPE_HOST and
//   resolves every other name normally. Next's server bundle requires node:dns
//   as an external and reads `lookup` off it at call time, so the patch applies;
// - net.Socket.prototype.connect sends a connection to FAKE_RECIPE_HOST on
//   port 80 to the fake server: it swaps in the server's port and wraps the
//   request's `lookup`, so fetchPage's check sees FAKE_RECIPE_ADDRESS and
//   approves it before the socket is pointed at 127.0.0.1.
// Connections to any other host, IP literals included, are untouched.
//
// /slow is held until the test calls releaseSlowPage().
import dns from 'node:dns'
import { existsSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { syncBuiltinESMExports } from 'node:module'
import net, { type AddressInfo, type LookupFunction } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { FAKE_RECIPE_ADDRESS, FAKE_RECIPE_HOST, SLOW_PAGE_RELEASE } from './recipeSite.ts'

function recipeHtml(recipe: Record<string, unknown>): string {
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Recipe', ...recipe })
  return `<!doctype html><html><head><title>${recipe.name}</title><script type="application/ld+json">${jsonLd}</script></head><body><h1>${recipe.name}</h1></body></html>`
}

const lasagna = {
  name: 'E2E Imported Lasagna',
  description: 'A rich, layered bake.',
  image: 'https://images.e2e.test/lasagna.jpg',
  author: { '@type': 'Person', name: 'Nonna Llama' },
  prepTime: 'PT30M',
  cookTime: 'PT1H15M',
  recipeYield: 'Serves 8',
  recipeCategory: 'Dinner',
  recipeCuisine: 'Italian',
  recipeIngredient: ['12 lasagna sheets', '2 cups ricotta', '1 lb ground beef'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Brown the beef.' },
    { '@type': 'HowToStep', text: 'Layer the sheets, ricotta and beef.' },
    { '@type': 'HowToStep', text: 'Bake for 45 minutes.' },
  ],
}

const soup = {
  name: 'E2E Imported Soup',
  description: 'A quick tomato soup.',
  recipeYield: '4',
  prepTime: 'PT10M',
  cookTime: 'PT20M',
  recipeIngredient: ['1 can tomatoes', '2 cups stock'],
  recipeInstructions: 'Simmer the tomatoes in the stock.\nBlend until smooth.',
}

const pie = {
  name: 'E2E Imported Pie',
  description: 'An apple pie.',
  image: 'https://images.e2e.test/fail-pie.jpg',
  recipeYield: '8',
  prepTime: 'PT40M',
  cookTime: 'PT50M',
  recipeIngredient: ['6 apples', '1 pie crust'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Fill the crust and bake.' }],
}

const stew = {
  name: 'E2E Imported Slow Stew',
  description: 'Worth the wait.',
  recipeYield: '6',
  prepTime: 'PT20M',
  cookTime: 'PT3H',
  recipeIngredient: ['2 lb beef'],
  recipeInstructions: 'Simmer for three hours.',
}

const NOT_A_RECIPE = `<!doctype html><html><head><title>About us</title><script type="application/ld+json">${JSON.stringify(
  { '@context': 'https://schema.org', '@type': 'Article', headline: 'About us' }
)}</script></head><body><h1>About us</h1></body></html>`

function sendHtml(response: ServerResponse, html: string) {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html)
}

const site = createServer(async (request, response) => {
  switch (request.url) {
    case '/lasagna':
      return sendHtml(response, recipeHtml(lasagna))
    case '/no-photo':
      return sendHtml(response, recipeHtml(soup))
    case '/photo-fails':
      return sendHtml(response, recipeHtml(pie))
    case '/not-a-recipe':
      return sendHtml(response, NOT_A_RECIPE)
    case '/redirect':
      return response.writeHead(302, { Location: '/lasagna' }).end()
    case '/slow':
      // Bounded by fetchPage's own timeout, which closes the request.
      while (!existsSync(SLOW_PAGE_RELEASE)) {
        if (request.destroyed) return
        await delay(50)
      }
      return sendHtml(response, recipeHtml(stew))
    default:
      return response.writeHead(404, { 'Content-Type': 'text/html' }).end('<h1>Not found</h1>')
  }
})
await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
// Never keeps the process alive on its own.
site.unref()
const sitePort = (site.address() as AddressInfo).port

const realLookup = dns.lookup
// Same signatures as dns.lookup: (hostname, [options | family], callback).
dns.lookup = function fakeRecipeSiteLookup(hostname: string, ...rest: unknown[]) {
  if (hostname !== FAKE_RECIPE_HOST) return (realLookup as (...args: unknown[]) => void)(hostname, ...rest)
  const callback = rest.at(-1) as (...args: unknown[]) => void
  const all = typeof rest[0] === 'object' && rest[0] !== null && (rest[0] as dns.LookupOptions).all
  process.nextTick(() =>
    all ? callback(null, [{ address: FAKE_RECIPE_ADDRESS, family: 4 }]) : callback(null, FAKE_RECIPE_ADDRESS, 4)
  )
} as typeof dns.lookup
syncBuiltinESMExports()

// Runs the request's own lookup, then points the socket at the fake server
// instead of FAKE_RECIPE_ADDRESS. Its other answers pass through unchanged.
function toFakeSite(lookup: LookupFunction): LookupFunction {
  return (hostname, options, callback) =>
    lookup(hostname, options, (error, address, family) => {
      if (error) return callback(error, address, family)
      if (Array.isArray(address)) {
        return callback(null, address.map((entry) => (entry.address === FAKE_RECIPE_ADDRESS ? { address: '127.0.0.1', family: 4 } : entry)))
      }
      return address === FAKE_RECIPE_ADDRESS ? callback(null, '127.0.0.1', 4) : callback(null, address, family)
    })
}

const realConnect = net.Socket.prototype.connect
// connect takes (options, callback), (port, host, callback) or, from
// net.connect, the already normalized [options, callback] array.
net.Socket.prototype.connect = function fakeRecipeSiteConnect(this: net.Socket, ...args: unknown[]) {
  const first = args[0]
  const options = (Array.isArray(first) ? first[0] : first) as net.TcpSocketConnectOpts | undefined
  if (typeof options === 'object' && options?.host === FAKE_RECIPE_HOST && Number(options.port) === 80) {
    options.port = sitePort
    options.lookup = toFakeSite(options.lookup ?? (dns.lookup as LookupFunction))
  }
  return (realConnect as (...args: unknown[]) => net.Socket).apply(this, args)
} as typeof net.Socket.prototype.connect
