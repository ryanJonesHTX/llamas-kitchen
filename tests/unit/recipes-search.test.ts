import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS } from '../../lib/constants'
import { searchFilter, searchWords } from '../../lib/recipes/search'
import { day, pendingDoc, recipeDoc, rejectedDoc } from '../fixtures/recipes'

// Recipe search: the tokenizer, the word-prefix filter as MongoDB runs it
// (its PCRE, not JS, decides what \p{L} and case-insensitivity mean), and the
// q param of the /recipes listing. The fixtures are seeded once; every test
// only reads.

let mongo: MongoMemoryServer
let listing: typeof import('../../lib/recipes/listing')

type SearchParams = Record<string, string | string[] | undefined>

const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'))
const items = (...names: string[]) => names.map((item) => ({ quantity: 1, unit: null, item }))

// Newest first. Times: quick is a total of at most 80 minutes.
const published = [
  {
    name: 'Chicken Thighs with Rice',
    ingredients: items('chicken thighs', 'rice'),
    tags: ['dinner'],
    prepTime: 30,
    cookTime: 60,
  },
  { name: 'Évora Bread', ingredients: items('flour', 'water'), tags: ['baking'], prepTime: 30, cookTime: 60 },
  {
    name: 'Jalapeño Poppers',
    ingredients: items('jalapeño peppers', 'cream cheese'),
    tags: ['appetizer'],
    prepTime: 10,
    cookTime: 20,
  },
  { name: 'Crème Brûlée', ingredients: items('heavy cream', 'sugar'), tags: ['dessert', 'french'], prepTime: 20, cookTime: 40 },
  { name: '5 Spice Pork', ingredients: items('five-spice powder', 'pork belly'), tags: ['dinner'], prepTime: 10, cookTime: 90 },
  { name: 'Beef Stew', ingredients: items('stewing beef', 'carrots'), tags: ['main dish'], prepTime: 20, cookTime: 120 },
  { name: 'Lemon Chicken', ingredients: items('chicken breast', 'lemon'), tags: ['dinner', 'quick'], prepTime: 10, cookTime: 10 },
]
const NEWEST = published.map((r) => r.name)

// Hidden recipes match the searches below and would sort first.
const hidden = [
  pendingDoc({ _id: id(100), name: 'Chicken Pending Pie', slug: 'chicken-pending-pie', tags: ['dinner'] }),
  rejectedDoc({ _id: id(101), name: 'Chicken Rejected Roast', slug: 'chicken-rejected-roast', tags: ['dinner'] }),
]

const fixtures = [
  ...published.map((recipe, i) =>
    recipeDoc({ ...recipe, _id: id(i + 1), slug: `recipe-${i + 1}`, publishedAt: day(published.length - i) })
  ),
  ...hidden,
]

const parse = (params: SearchParams) => listing.parseListingParams(params)

function query(params: SearchParams) {
  const parsed = parse(params)
  if (parsed === null) throw new Error(`expected valid params: ${JSON.stringify(params)}`)
  return parsed
}

async function names(params: SearchParams, limit?: number) {
  const { recipes } = await listing.listPublished(query(params), limit)
  return recipes.map((r) => r.name)
}

const search = (q: string) => names({ q })

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('recipes-search-test')
  await (await import('../../lib/dbConnect.ts')).default()
  const { Recipe } = await import('../../lib/recipes/model')
  await Recipe.create(fixtures)
  listing = await import('../../lib/recipes/listing')
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('searchWords', () => {
  it.each<[string, string[]]>([
    ['chicken', ['chicken']],
    ['Chic THI', ['chic', 'thi']],
    ['  spaced   out  ', ['spaced', 'out']],
    ['five-spice, pork!', ['five', 'spice', 'pork']],
    ['a.b', ['a', 'b']],
    ['chicken Chicken CHICKEN', ['chicken']],
    ['Jalapeño CRÈME brûlée', ['jalapeño', 'crème', 'brûlée']],
    ['5 spice 2x', ['5', 'spice', '2x']],
    ['', []],
    ['!!! ... ()*', []],
    ['.*', []],
  ])('%j -> %j', (text, words) => {
    expect(searchWords(text)).toEqual(words)
  })
})

describe('searchFilter', () => {
  it('needs at least one word', () => {
    expect(() => searchFilter([])).toThrow()
  })

  it.each([['a.b'], ['('], ['*'], ['two words'], ['']])('throws on %j, which is not a search word', (word) => {
    expect(() => searchFilter([word])).toThrow()
  })
})

describe('search through listPublished', () => {
  it('matches a word prefix at the start of a word in the name', async () => {
    expect(await search('chic')).toEqual(['Chicken Thighs with Rice', 'Lemon Chicken'])
    expect(await search('thi')).toEqual(['Chicken Thighs with Rice'])
    expect(await search('chic thi')).toEqual(['Chicken Thighs with Rice'])
  })

  it('does not match inside a word', async () => {
    expect(await search('ken')).toEqual([])
    expect(await search('hicken')).toEqual([])
    expect(await search('eam')).toEqual([])
  })

  it('matches through an ingredient item', async () => {
    expect(await search('rice')).toEqual(['Chicken Thighs with Rice'])
    expect(await search('carr')).toEqual(['Beef Stew'])
  })

  it('matches through a tag, including a word inside a multi-word tag', async () => {
    expect(await search('appet')).toEqual(['Jalapeño Poppers'])
    expect(await search('dish')).toEqual(['Beef Stew'])
  })

  it('matches after any non-letter, non-digit character', async () => {
    expect(await search('spice')).toEqual(['5 Spice Pork'])
    expect(await search('5')).toEqual(['5 Spice Pork'])
  })

  it('needs every word to match, each in any field', async () => {
    // name + tag, name + ingredient, ingredient + tag.
    expect(await search('lemon dinner')).toEqual(['Lemon Chicken'])
    expect(await search('chicken rice')).toEqual(['Chicken Thighs with Rice'])
    expect(await search('cream appetizer')).toEqual(['Jalapeño Poppers'])
    expect(await search('chicken dessert')).toEqual([])
  })

  it('ignores case', async () => {
    expect(await search('LEMON')).toEqual(['Lemon Chicken'])
    expect(await search('cHiCkEn ThIgHs')).toEqual(['Chicken Thighs with Rice'])
  })

  // These run MongoDB's regex engine on non-ASCII text.
  describe('non-ASCII letters', () => {
    it('match as letters', async () => {
      expect(await search('jalapeño')).toEqual(['Jalapeño Poppers'])
      expect(await search('jalapeñ')).toEqual(['Jalapeño Poppers'])
      expect(await search('crème brûlée')).toEqual(['Crème Brûlée'])
    })

    it('ignore case', async () => {
      // Stored "Évora"; the query is lowercased to "évora".
      expect(await search('ÉVORA')).toEqual(['Évora Bread'])
      expect(await search('évora')).toEqual(['Évora Bread'])
      expect(await search('CRÈME BRÛLÉE')).toEqual(['Crème Brûlée'])
    })

    it('are not word boundaries', async () => {
      // "lée" follows "û" and "o" follows "ñ"; both are letters.
      expect(await search('lée')).toEqual([])
      expect(await search('o poppers')).toEqual([])
    })

    it('are not folded to their ASCII base letter', async () => {
      expect(await search('creme')).toEqual([])
    })
  })

  describe('regex metacharacters cannot widen the match or throw', () => {
    it('"a.b" searches the words "a" and "b"', async () => {
      expect(await search('a.b')).toEqual(await search('a b'))
    })

    it.each([['('], ['*'], ['.*'], ['['], ['\\'], ['^'], ['$'], ['|'], ['+?']])('%j matches nothing', async (q) => {
      expect(await listing.listPublished(query({ q }))).toEqual({ recipes: [], nextCursor: null })
    })

    it('"chicken.*" is just "chicken"', async () => {
      expect(await search('chicken.*')).toEqual(await search('chicken'))
    })
  })

  it('never returns pending or rejected recipes', async () => {
    for (const q of ['chicken', 'pie', 'roast', 'dinner', 'beef']) {
      const found = await search(q)
      expect(found).not.toContain('Chicken Pending Pie')
      expect(found).not.toContain('Chicken Rejected Roast')
    }
  })

  it('combines with the tag and time filters', async () => {
    expect(await names({ q: 'chicken', tag: 'quick' })).toEqual(['Lemon Chicken'])
    expect(await names({ q: 'dinner', tag: ['quick', 'dessert'] })).toEqual(['Lemon Chicken'])
    expect(await names({ q: 'chicken', time: 'long' })).toEqual(['Chicken Thighs with Rice'])
    expect(await names({ q: 'chicken', time: 'quick' })).toEqual(['Lemon Chicken'])
    expect(await names({ q: 'cream', tag: 'appetizer', time: 'quick' })).toEqual(['Jalapeño Poppers'])
  })

  it('keeps the sort order', async () => {
    expect(await names({ q: 'dinner' })).toEqual(['Chicken Thighs with Rice', '5 Spice Pork', 'Lemon Chicken'])
    expect(await names({ q: 'dinner', sort: 'oldest' })).toEqual(['Lemon Chicken', '5 Spice Pork', 'Chicken Thighs with Rice'])
  })

  describe('paging through search results yields every match exactly once, in order', () => {
    const cases = [
      { q: 'dinner', newest: ['Chicken Thighs with Rice', '5 Spice Pork', 'Lemon Chicken'] },
      { q: 'c', newest: ['Chicken Thighs with Rice', 'Jalapeño Poppers', 'Crème Brûlée', 'Beef Stew', 'Lemon Chicken'] },
    ]
    const runs = cases.flatMap((c) =>
      [undefined, 'oldest'].flatMap((sort) =>
        [1, 2].map((limit) => ({ ...c, sort, limit, expected: sort ? [...c.newest].reverse() : c.newest }))
      )
    )

    it.each(runs)('q=$q, sort=$sort, limit $limit', async ({ q, sort, limit, expected }) => {
      const pages: string[][] = []
      let after: string | undefined
      do {
        const { recipes, nextCursor } = await listing.listPublished(query({ q, sort, after }), limit)
        pages.push(recipes.map((r) => r.name))
        after = nextCursor ?? undefined
      } while (after !== undefined)
      for (const page of pages) expect(page.length).toBeGreaterThan(0)
      expect(pages.flat()).toEqual(expected)
    })
  })
})

describe('parseListingParams q', () => {
  it('reads no q, an empty q and a blank q as no search', async () => {
    expect(parse({})).toMatchObject({ q: undefined })
    expect(parse({ q: '' })).toEqual(parse({}))
    expect(parse({ q: '   ' })).toEqual(parse({}))
    expect(await names({ q: '   ' })).toEqual(NEWEST)
  })

  it('keeps the trimmed text', () => {
    expect(parse({ q: '  Chic thi ' })).toMatchObject({ q: 'Chic thi' })
  })

  it('combines with the other params', () => {
    expect(parse({ q: 'chicken', tag: 'dinner', time: 'quick', sort: 'oldest' })).toMatchObject({
      q: 'chicken',
      tags: ['dinner'],
      time: 'quick',
      sort: 'oldest',
    })
  })

  it(`accepts ${MAX_SEARCH_QUERY_LENGTH} characters, and more surrounding whitespace`, () => {
    const text = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH)
    expect(parse({ q: text })).toMatchObject({ q: text })
    expect(parse({ q: `  ${text}  ` })).toMatchObject({ q: text })
  })

  it(`accepts ${MAX_SEARCH_WORDS} distinct words, and repeats of them`, () => {
    const words = Array.from({ length: MAX_SEARCH_WORDS }, (_, i) => `w${i}`)
    expect(parse({ q: words.join(' ') })).not.toBeNull()
    expect(parse({ q: [...words, ...words].join(' ') })).not.toBeNull()
  })

  it('reads punctuation-only text as a search that matches nothing', async () => {
    expect(parse({ q: '!!!' })).toMatchObject({ q: '!!!' })
    expect(await listing.listPublished(query({ q: '!!!' }))).toEqual({ recipes: [], nextCursor: null })
  })

  describe('returns null for a malformed q', () => {
    it.each<[string, SearchParams]>([
      [`more than ${MAX_SEARCH_QUERY_LENGTH} characters`, { q: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1) }],
      [
        `more than ${MAX_SEARCH_WORDS} distinct words`,
        { q: Array.from({ length: MAX_SEARCH_WORDS + 1 }, (_, i) => `w${i}`).join(' ') },
      ],
      ['q given twice', { q: ['chicken', 'rice'] }],
      ['q given twice with the same value', { q: ['chicken', 'chicken'] }],
      ['a malformed q next to valid params', { q: ['chicken', 'rice'], tag: 'dinner' }],
    ])('%s', (_label, params) => {
      expect(parse(params)).toBeNull()
    })
  })
})
