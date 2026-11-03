import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RecipeFormValues } from '../../components/RecipeForm'
import { MAX_RECIPE_INGREDIENTS, MAX_RECIPE_STEPS, MAX_RECIPE_TAGS } from '../../lib/constants'
import { parseRecipePage } from '../../lib/import/parseRecipe'
import { parseIngredient } from '../../lib/ingredients'
import { recipeInputSchema } from '../../lib/recipes/input'

// parseRecipePage: a fetched page's schema.org Recipe (JSON-LD) as prefilled
// recipe-form values, plus the photo URL to import. Pure, no network.

const PAGE_URL = 'https://cooking.example.com/recipes/stew'

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/import/${name}`, import.meta.url), 'utf8')
}

function ldJson(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`
}

function page(...scripts: string[]): string {
  return `<!doctype html><html><head><title>Test</title>${scripts.join('\n')}</head><body></body></html>`
}

// A page whose only JSON-LD is one Recipe with these fields.
function recipePage(fields: Record<string, unknown>): string {
  return page(ldJson({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Stew', ...fields }))
}

function parse(fields: Record<string, unknown>) {
  const result = parseRecipePage(recipePage(fields), PAGE_URL)
  if (!result) throw new Error('expected a Recipe to be found')
  return result
}

function values(fields: Record<string, unknown>): RecipeFormValues {
  return parse(fields).values
}

// What the form does with its values on submit: rows to the action input.
function asRecipeInput(formValues: RecipeFormValues) {
  return {
    ...formValues,
    ingredients: formValues.ingredients.map((row) => row.line).filter((line) => line.trim()).map(parseIngredient),
    steps: formValues.steps.map((row) => row.text.trim()).filter(Boolean),
  }
}

describe('parseRecipePage on realistic pages', () => {
  it('maps a WP Recipe Maker style @graph page, Recipe alongside Article, WebPage and Person', () => {
    expect(parseRecipePage(fixture('wprm-graph.html'), 'https://blog.example.com/lentil-soup/')).toEqual({
      values: {
        name: 'Weeknight Lentil Soup',
        description: "A cosy, one-pot soup that's ready in under an hour.",
        ingredients: [
          { line: '1 cup red lentils' },
          { line: '2 tbsp olive oil' },
          { line: '1 onion, diced' },
          { line: '4 cups vegetable stock' },
          { line: 'Salt & pepper to taste' },
        ],
        steps: [
          { text: 'Rinse the lentils.' },
          { text: 'Dice the onion.' },
          { text: 'Soften the onion in the oil.' },
          { text: 'Add the lentils and stock and simmer for 30 minutes.' },
        ],
        tags: ['soup', 'main course', 'mediterranean'],
        servings: '4',
        prepTime: '15',
        cookTime: '40',
        notes: '',
        credit: 'Jo Tester',
        sourceUrl: 'https://blog.example.com/lentil-soup/',
      },
      imageUrl: 'https://blog.example.com/wp-content/uploads/lentil-soup.jpg',
    })
  })

  it('maps a top-level array page with @type ["Recipe", "NewsArticle"]', () => {
    expect(parseRecipePage(fixture('top-level-array.html'), 'https://bakes.example.org/desserts/lemon-bars')).toEqual({
      values: {
        name: 'Lemon Bars',
        description: 'Tangy lemon bars on a shortbread crust.',
        ingredients: [
          { line: '1 cup flour' },
          { line: '1/2 cup butter' },
          { line: '3 eggs' },
          { line: '1 cup sugar' },
          { line: '2 lemons, juiced' },
        ],
        steps: [
          { text: 'Press the crust into the pan and bake for 20 minutes.' },
          { text: 'Whisk the eggs, sugar and lemon juice.' },
          { text: 'Pour over the crust and bake until set.' },
        ],
        tags: ['dessert', 'american'],
        servings: '16',
        prepTime: '20',
        cookTime: '65',
        notes: '',
        credit: 'Sam Baker, Alex Oven',
        sourceUrl: 'https://bakes.example.org/desserts/lemon-bars',
      },
      imageUrl: 'https://bakes.example.org/photos/lemon-bars.jpg',
    })
  })

  it('maps a plain-object page with string instructions, a number yield and a string author', () => {
    expect(parseRecipePage(fixture('plain-object.html'), 'https://flat.example.net/flatbread')).toEqual({
      values: {
        name: 'Quick Flatbread',
        description: 'Soft flatbread with no yeast.',
        ingredients: [{ line: '2 cups flour' }, { line: '1 tsp baking powder' }, { line: '3/4 cup yogurt' }],
        steps: [
          { text: 'Mix everything into a soft dough.' },
          { text: 'Divide into six balls and roll them out.' },
          { text: 'Cook in a hot dry pan, 2 minutes a side.' },
        ],
        tags: ['bread', 'middle eastern', 'indian'],
        servings: '6',
        prepTime: '10',
        cookTime: '12',
        notes: '',
        credit: 'Pat Griddle',
        sourceUrl: 'https://flat.example.net/flatbread',
      },
      imageUrl: 'https://images.example.net/flatbread.jpg',
    })
  })

  it.each(['wprm-graph.html', 'top-level-array.html', 'plain-object.html'])(
    'produces values that pass recipe validation the way the form submits them (%s)',
    (name) => {
      const result = parseRecipePage(fixture(name), PAGE_URL)
      expect(result).not.toBeNull()
      const parsed = recipeInputSchema.safeParse(asRecipeInput(result!.values))
      expect(parsed.error?.issues).toBeUndefined()
      expect(parsed.success).toBe(true)
    }
  )
})

describe('finding the Recipe', () => {
  it('returns null for a page with no ld+json', () => {
    expect(parseRecipePage('<html><head><title>Hi</title></head><body><p>No data</p></body></html>', PAGE_URL)).toBeNull()
  })

  it('returns null when the ld+json has no Recipe', () => {
    const html = page(
      ldJson({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'A site' }),
      ldJson({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'Person', name: 'Jo' }] })
    )
    expect(parseRecipePage(html, PAGE_URL)).toBeNull()
  })

  it('ignores a Recipe in a script that is not ld+json', () => {
    const html = page(`<script type="application/json">${JSON.stringify({ '@type': 'Recipe', name: 'Stew' })}</script>`)
    expect(parseRecipePage(html, PAGE_URL)).toBeNull()
  })

  it('skips a malformed JSON-LD block and uses a valid one after it', () => {
    const html = page(
      '<script type="application/ld+json">{"@type": "Recipe", "name": "Broken",</script>',
      ldJson({ '@type': 'Recipe', name: 'Good Stew' })
    )
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Good Stew')
  })

  it('takes the first Recipe when there are several', () => {
    const html = page(ldJson({ '@type': 'Recipe', name: 'First' }), ldJson({ '@type': 'Recipe', name: 'Second' }))
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('First')
  })

  it('finds a Recipe in a @graph', () => {
    const html = page(ldJson({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'Graph Stew' }] }))
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Graph Stew')
  })

  it('finds a Recipe in a @graph inside a top-level array', () => {
    const html = page(ldJson([{ '@type': 'WebSite' }, { '@graph': [{ '@type': 'Recipe', name: 'Deep Stew' }] }]))
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Deep Stew')
  })

  it('matches @type given as an array containing "Recipe"', () => {
    const html = page(ldJson({ '@type': ['NewsArticle', 'Recipe'], name: 'Typed Stew' }))
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Typed Stew')
  })

  it('finds a Recipe under WebPage.mainEntity', () => {
    const html = page(ldJson({ '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Main Stew' } }))
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Main Stew')
  })

  it('finds a Recipe in a mainEntity array of a @graph node', () => {
    const html = page(
      ldJson({ '@graph': [{ '@type': 'WebPage', mainEntity: [{ '@type': 'Person' }, { '@type': 'Recipe', name: 'Listed Stew' }] }] })
    )
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Listed Stew')
  })

  it('does not search other nested properties for a Recipe', () => {
    const html = page(ldJson({ '@type': 'WebPage', about: { '@type': 'Recipe', name: 'Hidden Stew' } }))
    expect(parseRecipePage(html, PAGE_URL)).toBeNull()
  })

  it.each([
    `<script type='application/ld+json'>`,
    `<SCRIPT TYPE="application/ld+json">`,
    `<script id="schema" class="yoast-schema-graph" type="application/ld+json">`,
    `<script type=" application/ld+json ">`,
    `<script data-x="1"\n  type="application/ld+json"\n>`,
  ])('reads a JSON-LD block opened with %s', (openTag) => {
    const closeTag = openTag.startsWith('<SCRIPT') ? '</SCRIPT>' : '</script>'
    const html = page(`${openTag}${JSON.stringify({ '@type': 'Recipe', name: 'Any Stew' })}${closeTag}`)
    expect(parseRecipePage(html, PAGE_URL)?.values.name).toBe('Any Stew')
  })
})

describe('text cleanup', () => {
  it('decodes entities and strips tags in the name and description', () => {
    expect(values({ name: 'Mac &amp; Cheese', description: '<p>Rich &quot;and&quot; <b>creamy</b> soup.</p>' })).toMatchObject({
      name: 'Mac & Cheese',
      description: 'Rich "and" creamy soup.',
    })
  })

  // Tags are stripped before decoding, so encoded markup survives as literal text.
  it('keeps entity-encoded markup as literal text', () => {
    expect(values({ name: '&lt;b&gt;hi&lt;/b&gt;' }).name).toBe('<b>hi</b>')
  })

  it('replaces each tag with a space', () => {
    expect(values({ recipeInstructions: ['Mix<br>stir', 'Fold<br/>bake'] }).steps).toEqual([
      { text: 'Mix stir' },
      { text: 'Fold bake' },
    ])
  })

  it.each([
    ['Ready in &lt; 1 hour', 'Ready in < 1 hour'],
    ['Serves &gt; 4', 'Serves > 4'],
    ['it&#39;s', "it's"],
    ['it&apos;s', "it's"],
    ['caf&#233;', 'café'],
    ['caf&#xE9;', 'café'],
    ['caf&#xe9;', 'café'],
    ['one&nbsp;pot', 'one pot'],
  ])('decodes %j to %j', (encoded, decoded) => {
    expect(values({ name: encoded }).name).toBe(decoded)
  })

  it('decodes entities only once', () => {
    expect(values({ name: 'Fish &amp;amp; Chips &amp;lt;3' }).name).toBe('Fish &amp; Chips &lt;3')
  })

  it('collapses whitespace runs and trims', () => {
    expect(values({ name: '  Slow \n\t  Cooker   Stew  ', description: ' Big \n  pot. ' })).toMatchObject({
      name: 'Slow Cooker Stew',
      description: 'Big pot.',
    })
  })

  it('cleans ingredient lines', () => {
    expect(
      values({ recipeIngredient: ['2 cups <strong>beef</strong> stock', 'Salt &amp;  pepper', '1&#189; tsp thyme'] })
        .ingredients
    ).toEqual([{ line: '2 cups beef stock' }, { line: 'Salt & pepper' }, { line: '1½ tsp thyme' }])
  })

  it('cleans step text', () => {
    expect(
      values({
        recipeInstructions: [
          { '@type': 'HowToStep', text: '<p>Brown the beef &amp; onions.</p>' },
          { '@type': 'HowToStep', text: 'Simmer   for <em>two</em>&nbsp;hours.' },
        ],
      }).steps
    ).toEqual([{ text: 'Brown the beef & onions.' }, { text: 'Simmer for two hours.' }])
  })
})

describe('name, description, notes, sourceUrl', () => {
  it("uses '' for a missing description", () => {
    expect(values({}).description).toBe('')
  })

  it("sets notes to '' and leaves imagePublicId unset", () => {
    const result = values({ notes: 'ignored' })
    expect(result.notes).toBe('')
    expect(result.imagePublicId).toBeUndefined()
  })

  it('sets sourceUrl to the page URL it was given', () => {
    expect(parseRecipePage(recipePage({}), 'https://final.example.com/after/redirect')?.values.sourceUrl).toBe(
      'https://final.example.com/after/redirect'
    )
  })

  it('does not truncate over-long fields', () => {
    const longName = 'Stew '.repeat(200).trim()
    expect(values({ name: longName }).name).toBe(longName)
  })
})

describe('ingredients', () => {
  it('turns recipeIngredient into one row per line, dropping blanks', () => {
    expect(values({ recipeIngredient: ['1 onion', '', '   ', '<span></span>', '2 carrots'] }).ingredients).toEqual([
      { line: '1 onion' },
      { line: '2 carrots' },
    ])
  })

  it('reads the legacy ingredients key when recipeIngredient is missing', () => {
    expect(values({ ingredients: ['1 onion', '2 carrots'] }).ingredients).toEqual([
      { line: '1 onion' },
      { line: '2 carrots' },
    ])
  })

  it('prefers recipeIngredient over the legacy ingredients key', () => {
    expect(values({ recipeIngredient: ['1 onion'], ingredients: ['old line'] }).ingredients).toEqual([{ line: '1 onion' }])
  })

  it.each([[{}], [{ recipeIngredient: [] }], [{ recipeIngredient: ['', ' '] }]])(
    "gives the form's empty row when there are none (%j)",
    (fields) => {
      expect(values(fields).ingredients).toEqual([{ line: '' }])
    }
  )

  // Kept one past the limit so the form shows its "too many" error, while a
  // hostile page's huge list never reaches the browser.
  function lines(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${i + 1} onion`)
  }

  it.each([
    ['exactly the limit', MAX_RECIPE_INGREDIENTS, MAX_RECIPE_INGREDIENTS],
    ['one over the limit', MAX_RECIPE_INGREDIENTS + 1, MAX_RECIPE_INGREDIENTS + 1],
    ['100 000', 100_000, MAX_RECIPE_INGREDIENTS + 1],
  ])('keeps the first rows in order, at most one over the limit, for %s ingredients', (_, count, kept) => {
    expect(values({ recipeIngredient: lines(count) }).ingredients).toEqual(lines(kept).map((line) => ({ line })))
  })

  it('does not count blank ingredient lines toward the limit', () => {
    const withBlanks = lines(MAX_RECIPE_INGREDIENTS + 1).flatMap((line) => ['', line, '  '])
    expect(values({ recipeIngredient: withBlanks }).ingredients).toEqual(
      lines(MAX_RECIPE_INGREDIENTS + 1).map((line) => ({ line }))
    )
  })
})

describe('steps', () => {
  it('splits string instructions on newlines and drops blank lines', () => {
    expect(values({ recipeInstructions: 'Brown the beef.\n\n  \nAdd the stock.\r\nSimmer.\n' }).steps).toEqual([
      { text: 'Brown the beef.' },
      { text: 'Add the stock.' },
      { text: 'Simmer.' },
    ])
  })

  it('reads an array of strings', () => {
    expect(values({ recipeInstructions: ['Brown the beef.', '', 'Simmer.'] }).steps).toEqual([
      { text: 'Brown the beef.' },
      { text: 'Simmer.' },
    ])
  })

  it("reads HowToStep text, falling back to its name", () => {
    expect(
      values({
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Brown the beef.', name: 'Brown' },
          { '@type': 'HowToStep', name: 'Simmer for two hours.' },
        ],
      }).steps
    ).toEqual([{ text: 'Brown the beef.' }, { text: 'Simmer for two hours.' }])
  })

  it('flattens HowToSection steps in order and drops the section names', () => {
    expect(
      values({
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            name: 'For the stew',
            itemListElement: [
              { '@type': 'HowToStep', text: 'Brown the beef.' },
              { '@type': 'HowToStep', text: 'Simmer.' },
            ],
          },
          {
            '@type': 'HowToSection',
            name: 'To serve',
            itemListElement: [{ '@type': 'HowToStep', text: 'Ladle into bowls.' }],
          },
        ],
      }).steps
    ).toEqual([{ text: 'Brown the beef.' }, { text: 'Simmer.' }, { text: 'Ladle into bowls.' }])
  })

  it('flattens nested arrays and mixed entries in order', () => {
    expect(
      values({
        recipeInstructions: [
          ['Chop the onion.', { '@type': 'HowToStep', text: 'Brown the beef.' }],
          'Add the stock.',
          [[{ '@type': 'HowToStep', text: 'Simmer.' }]],
        ],
      }).steps
    ).toEqual([{ text: 'Chop the onion.' }, { text: 'Brown the beef.' }, { text: 'Add the stock.' }, { text: 'Simmer.' }])
  })

  it.each([[{}], [{ recipeInstructions: [] }], [{ recipeInstructions: '\n \n' }]])(
    "gives the form's empty row when there are none (%j)",
    (fields) => {
      expect(values(fields).steps).toEqual([{ text: '' }])
    }
  )

  // Kept one past the limit so the form shows its "too many" error, while a
  // hostile page's huge list never reaches the browser.
  function texts(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `Step ${i + 1}.`)
  }

  const shapes: [string, (steps: string[]) => unknown][] = [
    ['a newline-separated string', (steps) => steps.join('\n')],
    ['HowToStep arrays', (steps) => steps.map((text) => ({ '@type': 'HowToStep', text }))],
    [
      'HowToSection nesting',
      (steps) => [
        { '@type': 'HowToSection', name: 'First', itemListElement: steps.slice(0, 10).map((text) => ({ '@type': 'HowToStep', text })) },
        { '@type': 'HowToSection', name: 'Rest', itemListElement: steps.slice(10).map((text) => ({ '@type': 'HowToStep', text })) },
      ],
    ],
  ]
  const counts: [string, number, number][] = [
    ['exactly the limit', MAX_RECIPE_STEPS, MAX_RECIPE_STEPS],
    ['one over the limit', MAX_RECIPE_STEPS + 1, MAX_RECIPE_STEPS + 1],
    ['100 000', 100_000, MAX_RECIPE_STEPS + 1],
  ]

  it.each(shapes.flatMap(([shape, build]) => counts.map(([label, count, kept]) => [shape, label, build, count, kept] as const)))(
    'keeps the first steps in order, at most one over the limit, from %s with %s steps',
    (_, __, build, count, kept) => {
      expect(values({ recipeInstructions: build(texts(count)) }).steps).toEqual(texts(kept).map((text) => ({ text })))
    }
  )

  it('does not count blank steps toward the limit', () => {
    const withBlanks = texts(MAX_RECIPE_STEPS + 1).flatMap((text) => ['', text, { '@type': 'HowToStep', text: ' ' }])
    expect(values({ recipeInstructions: withBlanks }).steps).toEqual(texts(MAX_RECIPE_STEPS + 1).map((text) => ({ text })))
  })
})

describe('servings', () => {
  it.each([
    ['4 servings', '4'],
    [['4', '4 servings'], '4'],
    [['a few', '8 servings'], '8'],
    [6, '6'],
    ['Serves 6-8', '6'],
    ['12', '12'],
    ['a dozen', ''],
    [[], ''],
    ['', ''],
  ])('reads recipeYield %j as %j', (recipeYield, servings) => {
    expect(values({ recipeYield }).servings).toBe(servings)
  })

  it("is '' when recipeYield is missing", () => {
    expect(values({}).servings).toBe('')
  })
})

describe('prepTime and cookTime', () => {
  it.each([
    ['PT1H30M', '90'],
    ['PT45M', '45'],
    ['PT2H', '120'],
    ['P0DT1H5M', '65'],
    ['PT0S', '0'],
    ['P1DT0H', '1440'],
    ['PT1M20S', '1'],
    ['PT1M40S', '2'],
    ['about 20 minutes', ''],
    ['', ''],
  ])('reads %j as %j minutes', (duration, minutes) => {
    expect(values({ prepTime: duration, cookTime: duration })).toMatchObject({ prepTime: minutes, cookTime: minutes })
  })

  it("is '' when missing, and ignores totalTime", () => {
    expect(values({ totalTime: 'PT1H' })).toMatchObject({ prepTime: '', cookTime: '' })
  })

  it('reads prepTime and cookTime independently', () => {
    expect(values({ prepTime: 'PT10M', cookTime: 'PT2H' })).toMatchObject({ prepTime: '10', cookTime: '120' })
  })
})

describe('tags', () => {
  it('combines recipeCategory and recipeCuisine, normalized', () => {
    expect(values({ recipeCategory: ' Main Course ', recipeCuisine: 'ITALIAN' }).tags).toEqual(['main course', 'italian'])
  })

  it('splits comma-separated strings and reads arrays', () => {
    expect(values({ recipeCategory: 'Dinner, Soup,  Easy', recipeCuisine: ['French', 'Belgian'] }).tags).toEqual([
      'dinner',
      'soup',
      'easy',
      'french',
      'belgian',
    ])
  })

  it('cleans entities and tags from tag text', () => {
    expect(values({ recipeCategory: 'Soups &amp; <b>Stews</b>' }).tags).toEqual(['soups & stews'])
  })

  it('drops blanks and de-duplicates after normalizing, keeping first-seen order', () => {
    expect(values({ recipeCategory: ['Dinner', '', ' ', 'dinner'], recipeCuisine: 'DINNER, , Thai' }).tags).toEqual([
      'dinner',
      'thai',
    ])
  })

  it(`keeps at most the first ${MAX_RECIPE_TAGS} distinct tags`, () => {
    const many = Array.from({ length: MAX_RECIPE_TAGS + 5 }, (_, i) => `Tag ${i}`)
    expect(values({ recipeCategory: ['Tag 0', ...many] }).tags).toEqual(
      many.slice(0, MAX_RECIPE_TAGS).map((tag) => tag.toLowerCase())
    )
  })

  it('is empty when there are no categories or cuisines', () => {
    expect(values({}).tags).toEqual([])
  })
})

describe('credit', () => {
  it.each([
    ['a string', 'Jo Tester', 'Jo Tester'],
    ['a Person', { '@type': 'Person', name: 'Jo Tester' }, 'Jo Tester'],
    ['an array of Persons', [{ '@type': 'Person', name: 'Jo' }, { '@type': 'Person', name: 'Sam' }], 'Jo, Sam'],
    ['an array of strings and Persons', ['Jo', { name: 'Sam' }], 'Jo, Sam'],
    ['an Organization', { '@type': 'Organization', name: 'Test Kitchen &amp; Co' }, 'Test Kitchen & Co'],
    ['a Person with no name', { '@type': 'Person' }, ''],
    ['an empty array', [], ''],
  ])('reads author as %s', (_, author, credit) => {
    expect(values({ author }).credit).toBe(credit)
  })

  it("is '' when author is missing", () => {
    expect(values({}).credit).toBe('')
  })

  const JO = { '@type': 'Person', '@id': 'https://cooking.example.com/#person-jo', name: 'Jo Tester' }

  function creditOf(html: string): string | undefined {
    return parseRecipePage(html, PAGE_URL)?.values.credit
  }

  it('resolves an @id author from a Person elsewhere in the @graph', () => {
    const html = page(ldJson({ '@graph': [{ '@type': 'Recipe', name: 'Stew', author: { '@id': JO['@id'] } }, JO] }))
    expect(creditOf(html)).toBe('Jo Tester')
  })

  it('resolves an @id author from a Person elsewhere in a top-level array', () => {
    const html = page(ldJson([JO, { '@type': 'Recipe', name: 'Stew', author: [{ '@id': JO['@id'] }, 'Sam'] }]))
    expect(creditOf(html)).toBe('Jo Tester, Sam')
  })

  it('skips an @id author that matches no node in its block', () => {
    const html = page(
      ldJson({ '@graph': [{ '@type': 'Recipe', name: 'Stew', author: ['Sam', { '@id': 'https://cooking.example.com/#nobody' }] }] })
    )
    expect(creditOf(html)).toBe('Sam')
  })

  it('does not resolve an @id author from a different JSON-LD block', () => {
    const html = page(
      ldJson({ '@graph': [{ '@type': 'Recipe', name: 'Stew', author: { '@id': JO['@id'] } }] }),
      ldJson({ '@graph': [JO] })
    )
    expect(creditOf(html)).toBe('')
  })
})

describe('imageUrl', () => {
  it.each([
    ['a string', 'https://img.example.com/stew.jpg', 'https://img.example.com/stew.jpg'],
    ['an http string', 'http://img.example.com/stew.jpg', 'http://img.example.com/stew.jpg'],
    ['an ImageObject url', { '@type': 'ImageObject', url: 'https://img.example.com/a.jpg' }, 'https://img.example.com/a.jpg'],
    [
      'an ImageObject contentUrl',
      { '@type': 'ImageObject', contentUrl: 'https://img.example.com/b.jpg' },
      'https://img.example.com/b.jpg',
    ],
    [
      'an ImageObject preferring url over contentUrl',
      { '@type': 'ImageObject', url: 'https://img.example.com/a.jpg', contentUrl: 'https://img.example.com/b.jpg' },
      'https://img.example.com/a.jpg',
    ],
    [
      'an array, taking the first',
      ['https://img.example.com/1.jpg', 'https://img.example.com/2.jpg'],
      'https://img.example.com/1.jpg',
    ],
    [
      'an array mixing ImageObjects and strings',
      [{ '@type': 'ImageObject', url: 'https://img.example.com/1.jpg' }, 'https://img.example.com/2.jpg'],
      'https://img.example.com/1.jpg',
    ],
    ['a root-relative URL, resolved against the page', '/images/stew.jpg', 'https://cooking.example.com/images/stew.jpg'],
    ['a path-relative URL, resolved against the page', 'stew.jpg', 'https://cooking.example.com/recipes/stew.jpg'],
    [
      'an array skipping a non-http URL',
      ['data:image/png;base64,iVBORw0KGgo=', { '@type': 'ImageObject', url: 'https://img.example.com/ok.jpg' }],
      'https://img.example.com/ok.jpg',
    ],
  ])('reads image as %s', (_, image, imageUrl) => {
    expect(parse({ image }).imageUrl).toBe(imageUrl)
  })

  it.each([
    ['only non-http URLs', ['ftp://img.example.com/stew.jpg', 'data:image/png;base64,iVBORw0KGgo=']],
    ['an ImageObject with no url', { '@type': 'ImageObject' }],
    ['an empty array', []],
  ])('is null for %s', (_, image) => {
    expect(parse({ image }).imageUrl).toBeNull()
  })

  it('is null when image is missing', () => {
    expect(parse({}).imageUrl).toBeNull()
  })
})

// Fetched pages are untrusted: none of these may take quadratic time or throw.
describe('hostile pages', () => {
  const MB = 1_000_000
  const TIMEOUT_MS = 10_000

  it.each([
    ['unclosed script tags', '<script '.repeat(MB / 8)],
    ['script tags with no closing tag', '<script>'.repeat(MB / 8)],
  ])('returns null quickly for about 1 MB of %s', (_, html) => {
    expect(parseRecipePage(html, PAGE_URL)).toBeNull()
  }, TIMEOUT_MS)

  it('cleans a name of a million "<" quickly', () => {
    expect(values({ name: '<'.repeat(MB) }).name).toBe('<'.repeat(MB))
  }, TIMEOUT_MS)

  // Built as text: JSON.stringify itself overflows the stack at this depth.
  function nested(depth: number, inner: string): string {
    return `${'['.repeat(depth)}${inner}${']'.repeat(depth)}`
  }

  it('ignores deeply nested recipeInstructions without throwing', () => {
    const recipe = `{"@type":"Recipe","name":"Stew","recipeInstructions":${nested(MB, '"Too deep."')}}`
    const html = `<script type="application/ld+json">${recipe}</script>`
    expect(parseRecipePage(html, PAGE_URL)?.values.steps).toEqual([{ text: '' }])
  }, TIMEOUT_MS)

  it('resolves tens of thousands of @id authors among unrelated @id nodes quickly', () => {
    const count = 30_000
    const authors = Array.from({ length: count }, (_, i) => ({ '@id': `#author-${i}` }))
    const others = Array.from({ length: count }, (_, i) => ({ '@type': 'Thing', '@id': `#other-${i}`, name: 'Other' }))
    const people = [{ '@type': 'Person', '@id': '#author-0', name: 'Jo' }]
    const html = page(ldJson({ '@graph': [{ '@type': 'Recipe', name: 'Stew', author: authors }, ...others, ...people] }))
    expect(parseRecipePage(html, PAGE_URL)?.values.credit).toBe('Jo')
  }, TIMEOUT_MS)

  it('returns null for a Recipe nested too deep in top-level arrays, without throwing', () => {
    const html = `<script type="application/ld+json">${nested(MB, '{"@type":"Recipe","name":"Stew"}')}</script>`
    expect(parseRecipePage(html, PAGE_URL)).toBeNull()
  }, TIMEOUT_MS)
})
