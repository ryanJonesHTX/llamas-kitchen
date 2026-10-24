import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MAX_RECIPE_TAGS } from '../../lib/constants'
import { day, pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'

// The /recipes listing: the URL search-param parser and the paged query,
// against an in-memory MongoDB. listPublished connects through lib/dbConnect,
// so MONGODB_URI is set before importing it. The fixtures are seeded once;
// every test only reads.

let mongo: MongoMemoryServer
let listing: typeof import('../../lib/recipes/listing')

// Search params as Next passes them to a page (after awaiting the Promise).
type SearchParams = Record<string, string | string[] | undefined>

const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))

// The documented cursor format: base64url of `<publishedAt epoch ms>_<ObjectId hex>`.
const b64url = (payload: string) => Buffer.from(payload).toString('base64url')
const cursorFor = (publishedAt: Date, _id: Types.ObjectId) => b64url(`${publishedAt.getTime()}_${_id.toHexString()}`)

// _ids deliberately disagree with publishedAt order, so a sort on either field
// alone gives the wrong order. Day 2 and day 4 have ties broken by _id.
//
// | name   | publishedAt | _id | tags          | prep+cook       |
// | Apple  | day 1       | 8   | beef          | 40+40 = 80 quick |
// | Bean   | day 2       | 3   | chicken       | 40+41 = 81 long  |
// | Corn   | day 2       | 7   | beef, quick   | 39+40 = 79 quick |
// | Dal    | day 2       | 5   | soup          | 0+120 long       |
// | Egg    | day 3       | 4   | chicken       | 10+10 quick      |
// | Fig    | day 4       | 2   | beef          | 60+60 long       |
// | Gumbo  | day 4       | 6   | dessert       | 20+20 quick      |
// | Hash   | day 5       | 1   | chicken, beef | 50+50 long       |
const published = [
  { name: 'Dal', publishedAt: day(2), n: 5, tags: ['soup'], prepTime: 0, cookTime: 120 },
  { name: 'Bean', publishedAt: day(2), n: 3, tags: ['chicken'], prepTime: 40, cookTime: 41 },
  { name: 'Gumbo', publishedAt: day(4), n: 6, tags: ['dessert'], prepTime: 20, cookTime: 20 },
  { name: 'Corn', publishedAt: day(2), n: 7, tags: ['beef', 'quick'], prepTime: 39, cookTime: 40 },
  { name: 'Hash', publishedAt: day(5), n: 1, tags: ['chicken', 'beef'], prepTime: 50, cookTime: 50 },
  { name: 'Fig', publishedAt: day(4), n: 2, tags: ['beef'], prepTime: 60, cookTime: 60 },
  { name: 'Apple', publishedAt: day(1), n: 8, tags: ['beef'], prepTime: 40, cookTime: 40, imagePublicId: 'recipes/apple' },
  { name: 'Egg', publishedAt: day(3), n: 4, tags: ['chicken'], prepTime: 10, cookTime: 10 },
]

// Hidden recipes match every filter used below and would sort first.
const hidden = [
  pendingDoc({ _id: id(9), name: 'Pending Pie', slug: 'pending-pie', tags: ['beef', 'chicken', 'soup'], prepTime: 5, cookTime: 5 }),
  rejectedDoc({ _id: id(10), name: 'Rejected Roast', slug: 'rejected-roast', tags: ['beef', 'chicken', 'soup'], prepTime: 60, cookTime: 60 }),
]

const fixtures = [
  ...published.map(({ n, name, ...rest }) => recipeDoc({ _id: id(n), name, slug: name.toLowerCase(), ...rest })),
  ...hidden,
]

const NEWEST = ['Hash', 'Gumbo', 'Fig', 'Egg', 'Corn', 'Dal', 'Bean', 'Apple']
const OLDEST = [...NEWEST].reverse()

const parse = (params: SearchParams) => listing.parseListingParams(params)

// Parses params that must be valid; fails the test otherwise.
function query(params: SearchParams) {
  const parsed = parse(params)
  if (parsed === null) throw new Error(`expected valid params: ${JSON.stringify(params)}`)
  return parsed
}

async function names(params: SearchParams, limit?: number) {
  const { recipes } = await listing.listPublished(query(params), limit)
  return recipes.map((r) => r.name)
}

// Follows nextCursor from the first page to the last, as the "More recipes"
// link does, and returns every page's names.
async function allPages(params: SearchParams, limit: number) {
  const pages: string[][] = []
  let after: string | undefined
  do {
    const { recipes, nextCursor } = await listing.listPublished(query({ ...params, after }), limit)
    pages.push(recipes.map((r) => r.name))
    after = nextCursor ?? undefined
  } while (after !== undefined)
  return pages
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-listing-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  listing = await import('../../lib/recipes/listing')
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('parseListingParams', () => {
  const validCursor = () => cursorFor(day(4), id(6))

  it('reads no params as every recipe, newest first, from the start', () => {
    const parsed = parse({})
    expect(parsed).not.toBeNull()
    expect(parsed!.tags).toEqual([])
    expect(parsed!.time).toBeUndefined()
    expect(parsed!.sort).toBe('newest')
    expect(parsed!.after).toBeUndefined()
  })

  it('reads one tag, several tags, the time filter and the oldest sort', () => {
    expect(parse({ tag: 'beef' })).toMatchObject({ tags: ['beef'] })
    expect(parse({ tag: ['beef', 'quick'] })).toMatchObject({ tags: ['beef', 'quick'] })
    expect(parse({ time: 'quick' })).toMatchObject({ time: 'quick' })
    expect(parse({ time: 'long' })).toMatchObject({ time: 'long' })
    expect(parse({ sort: 'oldest' })).toMatchObject({ sort: 'oldest' })
  })

  describe('accepts every combination of valid params', () => {
    const tagValues = [undefined, 'beef', ['beef', 'quick']]
    const timeValues = [undefined, 'quick', 'long']
    const sortValues = [undefined, 'newest', 'oldest']
    const afterValues = [false, true]
    const combos = tagValues.flatMap((tag) =>
      timeValues.flatMap((time) =>
        sortValues.flatMap((sort) => afterValues.map((withAfter) => ({ tag, time, sort, withAfter })))
      )
    )

    it.each(combos)('tag=$tag time=$time sort=$sort after=$withAfter', ({ tag, time, sort, withAfter }) => {
      const params: SearchParams = { tag, time, sort, after: withAfter ? validCursor() : undefined }
      expect(parse(params)).not.toBeNull()
    })
  })

  it(`accepts ${MAX_RECIPE_TAGS} distinct tags`, () => {
    const tags = Array.from({ length: MAX_RECIPE_TAGS }, (_, i) => `tag-${i}`)
    expect(parse({ tag: tags })).toMatchObject({ tags })
  })

  it('reads sort=newest the same as no sort', () => {
    expect(parse({ sort: 'newest' })).toEqual(parse({}))
  })

  it('lowercases tags with the shared tag rule', () => {
    expect(parse({ tag: 'Beef' })).toMatchObject({ tags: ['beef'] })
  })

  it('ignores unknown params', () => {
    expect(parse({ utm_source: 'newsletter', ref: ['a', 'b'] })).toEqual(parse({}))
    expect(parse({ utm_source: 'newsletter', tag: 'beef', time: 'long' })).toEqual(parse({ tag: 'beef', time: 'long' }))
  })

  describe('returns null for a malformed value of a known param', () => {
    const tooManyTags = Array.from({ length: MAX_RECIPE_TAGS + 1 }, (_, i) => `tag-${i}`)

    it.each<[string, () => SearchParams]>([
      ['an empty tag', () => ({ tag: '' })],
      ['a whitespace-only tag', () => ({ tag: '   ' })],
      ['an empty tag among valid ones', () => ({ tag: ['beef', ''] })],
      [`more than ${MAX_RECIPE_TAGS} tags`, () => ({ tag: tooManyTags })],
      ['a duplicated tag', () => ({ tag: ['beef', 'beef'] })],
      ['tags that differ only in case', () => ({ tag: ['Beef', 'beef'] })],
      ['tags that differ only in surrounding whitespace', () => ({ tag: ['beef', ' beef '] })],
      ['an unknown time', () => ({ time: 'x' })],
      ['an empty time', () => ({ time: '' })],
      ['the old time value <=80', () => ({ time: '<=80' })],
      ['time given twice', () => ({ time: ['quick', 'long'] })],
      ['time given twice with the same value', () => ({ time: ['quick', 'quick'] })],
      ['an unknown sort', () => ({ sort: 'x' })],
      ['the old sort value ascending', () => ({ sort: 'ascending' })],
      ['sort given twice', () => ({ sort: ['oldest', 'oldest'] })],
      ['a garbage cursor', () => ({ after: 'garbage' })],
      ['after given twice', () => ({ after: [validCursor(), validCursor()] })],
      ['a malformed value next to valid ones', () => ({ tag: 'beef', time: 'quick', sort: 'x' })],
    ])('%s', (_label, params) => {
      expect(parse(params())).toBeNull()
    })
  })
})

describe('cursor', () => {
  it('nextCursor is base64url of "<publishedAt ms>_<_id hex>" of the last recipe returned', async () => {
    // Newest first, the second recipe is Gumbo (day 4, _id 6).
    const { recipes, nextCursor } = await listing.listPublished(query({}), 2)
    expect(recipes.map((r) => r.name)).toEqual(['Hash', 'Gumbo'])
    expect(nextCursor).toBe(cursorFor(day(4), id(6)))
  })

  it('round-trips: a cursor from nextCursor parses and continues right after its recipe', async () => {
    const { nextCursor } = await listing.listPublished(query({}), 2)
    expect(parse({ after: nextCursor! })).not.toBeNull()
    expect(await names({ after: nextCursor! })).toEqual(NEWEST.slice(2))
  })

  it('accepts a well-formed cursor built from the documented format', async () => {
    expect(await names({ after: cursorFor(day(2), id(5)) })).toEqual(['Bean', 'Apple'])
  })

  const ms = String(day(4).getTime())
  const hex = id(6).toHexString()
  const valid = b64url(`${ms}_${hex}`)

  it.each<[string, string]>([
    ['the empty string', ''],
    ['characters outside base64url', '!!!***'],
    ['standard base64 padding', `${valid}=`],
    ['a truncated cursor', valid.slice(0, -1)],
    ['a cursor with extra characters appended', `${valid}AA`],
    ['the raw unencoded payload', `${ms}_${hex}`],
    ['no separator', b64url(`${ms}${hex}`)],
    ['only a timestamp', b64url(ms)],
    ['only an id', b64url(hex)],
    ['an empty timestamp', b64url(`_${hex}`)],
    ['an empty id', b64url(`${ms}_`)],
    ['a non-numeric timestamp', b64url(`abc_${hex}`)],
    ['a fractional timestamp', b64url(`${ms}.5_${hex}`)],
    ['a timestamp outside the Date range', b64url(`99999999999999999_${hex}`)],
    ['an id that is not hex', b64url(`${ms}_${'z'.repeat(24)}`)],
    ['an id that is too short', b64url(`${ms}_${hex.slice(1)}`)],
    ['an id that is too long', b64url(`${ms}_${hex}0`)],
    ['an extra field', b64url(`${ms}_${hex}_1`)],
    ['JSON instead of the format', b64url(JSON.stringify({ publishedAt: Number(ms), _id: hex }))],
  ])('rejects %s', (_label, after) => {
    expect(parse({ after })).toBeNull()
  })
})

describe('listPublished', () => {
  it('returns only published recipes, never pending or rejected ones', async () => {
    expect(await names({}, 100)).toEqual(NEWEST)
    for (const params of [{ tag: 'beef' }, { tag: ['chicken', 'soup'] }, { time: 'quick' }, { time: 'long' }]) {
      const found = await names(params, 100)
      expect(found).not.toContain('Pending Pie')
      expect(found).not.toContain('Rejected Roast')
    }
  })

  it('matches recipes with any of the selected tags', async () => {
    expect(await names({ tag: 'chicken' })).toEqual(['Hash', 'Egg', 'Bean'])
    expect(await names({ tag: ['chicken', 'soup'] })).toEqual(['Hash', 'Egg', 'Dal', 'Bean'])
    expect(await names({ tag: ['quick', 'dessert'] })).toEqual(['Gumbo', 'Corn'])
  })

  it('returns no recipes for a tag nobody uses', async () => {
    expect(await listing.listPublished(query({ tag: 'nothing' }))).toEqual({ recipes: [], nextCursor: null })
  })

  it('time=quick keeps totals up to and including 80 minutes', async () => {
    // Apple is exactly 80, Corn 79; Bean (81) is left out.
    expect(await names({ time: 'quick' })).toEqual(['Gumbo', 'Egg', 'Corn', 'Apple'])
  })

  it('time=long keeps totals over 80 minutes', async () => {
    expect(await names({ time: 'long' })).toEqual(['Hash', 'Fig', 'Dal', 'Bean'])
  })

  it('combines tag and time filters', async () => {
    expect(await names({ tag: 'beef', time: 'quick' })).toEqual(['Corn', 'Apple'])
    expect(await names({ tag: 'beef', time: 'long' })).toEqual(['Hash', 'Fig'])
  })

  it('sorts newest first by default: publishedAt then _id, both descending', async () => {
    expect(await names({})).toEqual(NEWEST)
  })

  it('sort=oldest sorts publishedAt then _id, both ascending', async () => {
    expect(await names({ sort: 'oldest' })).toEqual(OLDEST)
  })

  it('returns only the fields a recipe card needs', async () => {
    const { recipes } = await listing.listPublished(query({ sort: 'oldest' }), 1)
    expect(Object.keys(recipes[0]).sort()).toEqual(
      ['_id', 'cookTime', 'imagePublicId', 'name', 'prepTime', 'publishedAt', 'slug'].sort()
    )
    expect(recipes[0]).toMatchObject({ name: 'Apple', slug: 'apple', prepTime: 40, cookTime: 40, imagePublicId: 'recipes/apple' })
  })

  describe('paging through every page yields every match exactly once, in order', () => {
    // Expected lists are newest first; oldest is the reverse.
    const cases: { label: string; params: SearchParams; newest: string[] }[] = [
      { label: 'no filters', params: {}, newest: NEWEST },
      { label: 'tag=beef', params: { tag: 'beef' }, newest: ['Hash', 'Fig', 'Corn', 'Apple'] },
      { label: 'tag=chicken&tag=soup', params: { tag: ['chicken', 'soup'] }, newest: ['Hash', 'Egg', 'Dal', 'Bean'] },
      { label: 'time=long', params: { time: 'long' }, newest: ['Hash', 'Fig', 'Dal', 'Bean'] },
      { label: 'tag=beef&tag=chicken&time=quick', params: { tag: ['beef', 'chicken'], time: 'quick' }, newest: ['Egg', 'Corn', 'Apple'] },
    ]
    const orders = [
      { sort: undefined, expected: (newest: string[]) => newest },
      { sort: 'oldest', expected: (newest: string[]) => [...newest].reverse() },
    ]
    const runs = cases.flatMap((c) =>
      orders.flatMap((o) => [1, 2, 3].map((limit) => ({ ...c, sort: o.sort, expected: o.expected(c.newest), limit })))
    )

    it.each(runs)('$label, sort=$sort, limit $limit', async ({ params, sort, expected, limit }) => {
      const pages = await allPages({ ...params, sort }, limit)
      for (const page of pages) {
        expect(page.length).toBeGreaterThan(0)
        expect(page.length).toBeLessThanOrEqual(limit)
      }
      expect(pages.flat()).toEqual(expected)
    })
  })

  it('nextCursor is set when more recipes follow', async () => {
    expect((await listing.listPublished(query({}), 7)).nextCursor).not.toBeNull()
  })

  it('nextCursor is null on the last page', async () => {
    const { nextCursor } = await listing.listPublished(query({}), 3)
    const page2 = await listing.listPublished(query({ after: nextCursor! }), 3)
    const page3 = await listing.listPublished(query({ after: page2.nextCursor! }), 3)
    expect(page3.recipes.map((r) => r.name)).toEqual(['Bean', 'Apple'])
    expect(page3.nextCursor).toBeNull()
  })

  it('nextCursor is null when the results fit exactly in one page', async () => {
    const { recipes, nextCursor } = await listing.listPublished(query({}), NEWEST.length)
    expect(recipes).toHaveLength(NEWEST.length)
    expect(nextCursor).toBeNull()
  })

  it('nextCursor is null when the last page is exactly full', async () => {
    const page1 = await listing.listPublished(query({}), 4)
    const page2 = await listing.listPublished(query({ after: page1.nextCursor! }), 4)
    expect(page2.recipes.map((r) => r.name)).toEqual(NEWEST.slice(4))
    expect(page2.nextCursor).toBeNull()
  })

  // Mongo reads limit(0) as no limit, so anything but a positive integer must fail fast.
  it.each([[0], [-1], [1.5], [Number.NaN]])('rejects limit = %j', async (limit) => {
    await expect(listing.listPublished(query({}), limit)).rejects.toThrow()
  })
})
