import { describe, expect, it } from 'vitest'
import { recipeInputSchema } from '../../lib/recipes/input'
import {
  MAX_INGREDIENT_ITEM_LENGTH,
  MAX_INGREDIENT_UNIT_LENGTH,
  MAX_RECIPE_CREDIT_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_NAME_LENGTH,
  MAX_RECIPE_NOTES_LENGTH,
  MAX_RECIPE_STEP_LENGTH,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TAG_LENGTH,
  MAX_RECIPE_TAGS,
} from '../../lib/constants'

// recipeInputSchema: what a person or the import parser supplies. The server
// sets submittedBy, status, rejectionReason, publishedAt and slug.

type Input = Record<string, unknown>

function validInput(overrides: Input = {}): Input {
  return {
    name: 'Beef Stew',
    description: 'Hearty and warm.',
    ingredients: [
      { quantity: 2, unit: 'cups', item: 'beef stock' },
      { quantity: null, unit: null, item: 'Salt to taste' },
    ],
    steps: ['Brown the beef.', 'Simmer for two hours.'],
    servings: 4,
    prepTime: 20,
    cookTime: 120,
    tags: ['main dish'],
    ...overrides,
  }
}

function parsed(input: Input) {
  const result = recipeInputSchema.safeParse(input)
  if (!result.success) throw new Error(`expected valid input: ${JSON.stringify(result.error.issues)}`)
  return result.data as Input
}

// The message of each issue, like ['ingredients: Add at least one ingredient'].
function issueMessages(input: Input): string[] {
  const result = recipeInputSchema.safeParse(input)
  expect(result.success, 'expected invalid input').toBe(false)
  return result.error!.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
}

// The paths of every issue, like ['name', 'ingredients.0.item'].
function issuePaths(input: Input): string[] {
  const result = recipeInputSchema.safeParse(input)
  expect(result.success, 'expected invalid input').toBe(false)
  return result.error!.issues.map((issue) => issue.path.join('.'))
}

function expectIssueOn(input: Input, path: string) {
  const paths = issuePaths(input)
  expect(paths.some((p) => p === path || p.startsWith(`${path}.`)), paths.join(', ')).toBe(true)
}

function without(key: string): Input {
  const input = validInput()
  delete input[key]
  return input
}

describe('recipeInputSchema', () => {
  it('accepts a valid input and returns it unchanged', () => {
    expect(parsed(validInput())).toEqual(validInput())
  })

  it('keeps every optional field', () => {
    const optional = {
      imagePublicId: 'recipes/beef-stew',
      notes: 'Better the next day.',
      credit: 'Grandma',
      sourceUrl: 'https://www.seriouseats.com/beef-stew',
    }
    expect(parsed(validInput(optional))).toEqual(validInput(optional))
  })

  describe('field stripping', () => {
    it('drops the server-owned fields submittedBy, status, rejectionReason, publishedAt and slug', () => {
      const input = validInput({
        submittedBy: '64b000000000000000000001',
        status: 'published',
        rejectionReason: 'Nope.',
        publishedAt: '2024-01-01T00:00:00.000Z',
        slug: 'chosen-by-client',
      })
      expect(parsed(input)).toEqual(validInput())
    })

    it('drops unknown keys such as _id, createdAt and old-shape fields', () => {
      const input = validInput({
        _id: '65f000000000000000000000',
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        category: 'Dessert',
        directions: 'Mix.',
        isAdmin: true,
      })
      expect(parsed(input)).toEqual(validInput())
    })

    it.each(['imagePublicId', 'notes', 'credit', 'sourceUrl'])('treats a blank %s as absent', (field) => {
      expect(parsed(validInput({ [field]: '' }))[field]).toBeUndefined()
      expect(parsed(validInput({ [field]: '   ' }))[field]).toBeUndefined()
    })
  })

  describe('required fields', () => {
    it.each(['name', 'description', 'ingredients', 'steps', 'servings', 'prepTime', 'cookTime'])(
      'reports %s when it is missing',
      (field) => {
        expectIssueOn(without(field), field)
      }
    )

    it.each(['name', 'description'])('reports %s when it is blank after trimming', (field) => {
      expectIssueOn(validInput({ [field]: '   ' }), field)
    })

    it('trims name and description', () => {
      const data = parsed(validInput({ name: '  Beef Stew ', description: ' Hearty. ' }))
      expect(data.name).toBe('Beef Stew')
      expect(data.description).toBe('Hearty.')
    })

    it('allows a 120-character name but not 121', () => {
      expect(parsed(validInput({ name: 'x'.repeat(120) })).name).toHaveLength(120)
      expectIssueOn(validInput({ name: 'x'.repeat(121) }), 'name')
    })

    // Every recipe needs a slug, so a name slugify can't turn into one is invalid.
    it.each([['🍲🍲'], ['!!!'], ['🍰 - 🍰']])('rejects the name %j, which has nothing to slug', (name) => {
      expectIssueOn(validInput({ name }), 'name')
    })

    it.each([['Beef Stew 🍲'], ['🍰 & 🍰']])('accepts the name %j, which slugs to something', (name) => {
      expect(parsed(validInput({ name })).name).toBe(name)
    })
  })

  describe('ingredients and steps', () => {
    it('needs at least one ingredient', () => {
      expect(issueMessages(validInput({ ingredients: [] }))).toEqual(['ingredients: Add at least one ingredient'])
    })

    it.each([[0], [-1]])('rejects an ingredient quantity of %j', (quantity) => {
      expectIssueOn(validInput({ ingredients: [{ quantity, unit: 'cup', item: 'flour' }] }), 'ingredients')
    })

    it('rejects a blank ingredient item', () => {
      expectIssueOn(validInput({ ingredients: [{ quantity: 1, unit: 'cup', item: '  ' }] }), 'ingredients')
    })

    it('trims the ingredient unit and item', () => {
      const data = parsed(validInput({ ingredients: [{ quantity: 1, unit: ' cup ', item: ' flour ' }] }))
      expect(data.ingredients).toEqual([{ quantity: 1, unit: 'cup', item: 'flour' }])
    })

    it('needs at least one step', () => {
      expect(issueMessages(validInput({ steps: [] }))).toEqual(['steps: Add at least one step'])
    })

    it('rejects a blank step and trims the others', () => {
      expectIssueOn(validInput({ steps: ['Mix.', '  '] }), 'steps')
      expect(parsed(validInput({ steps: [' Mix. ', 'Bake.\n'] })).steps).toEqual(['Mix.', 'Bake.'])
    })
  })

  describe('tags', () => {
    const distinct = (n: number) => Array.from({ length: n }, (_, i) => `tag-${i}`)

    it('trims, lowercases and de-duplicates, keeping first-seen order', () => {
      const data = parsed(validInput({ tags: [' Dessert ', 'QUICK', 'dessert', 'quick '] }))
      expect(data.tags).toEqual(['dessert', 'quick'])
    })

    it(`accepts ${MAX_RECIPE_TAGS} tags but not ${MAX_RECIPE_TAGS + 1}`, () => {
      expect(MAX_RECIPE_TAGS).toBe(10)
      expect(parsed(validInput({ tags: distinct(MAX_RECIPE_TAGS) })).tags).toHaveLength(MAX_RECIPE_TAGS)
      expectIssueOn(validInput({ tags: distinct(MAX_RECIPE_TAGS + 1) }), 'tags')
    })

    it('applies the limit after de-duplicating', () => {
      const tags = [...distinct(MAX_RECIPE_TAGS), 'TAG-0', ' tag-1 ']
      expect(parsed(validInput({ tags })).tags).toEqual(distinct(MAX_RECIPE_TAGS))
    })

    it('accepts no tags', () => {
      expect(parsed(validInput({ tags: [] })).tags).toEqual([])
    })

    it('rejects a blank tag', () => {
      expectIssueOn(validInput({ tags: ['dessert', '  '] }), 'tags')
    })
  })

  // Each case builds an input with n of something. The form shows a list
  // entry's message under the whole list, so those name the list.
  describe.each<[string, number, string, (n: number) => Input, string]>([
    [
      'name length',
      MAX_RECIPE_NAME_LENGTH,
      'name',
      (n) => ({ name: 'x'.repeat(n) }),
      `must be at most ${MAX_RECIPE_NAME_LENGTH} characters`,
    ],
    [
      'description length',
      MAX_RECIPE_DESCRIPTION_LENGTH,
      'description',
      (n) => ({ description: 'x'.repeat(n) }),
      `must be at most ${MAX_RECIPE_DESCRIPTION_LENGTH} characters`,
    ],
    [
      'notes length',
      MAX_RECIPE_NOTES_LENGTH,
      'notes',
      (n) => ({ notes: 'x'.repeat(n) }),
      `must be at most ${MAX_RECIPE_NOTES_LENGTH} characters`,
    ],
    [
      'credit length',
      MAX_RECIPE_CREDIT_LENGTH,
      'credit',
      (n) => ({ credit: 'x'.repeat(n) }),
      `must be at most ${MAX_RECIPE_CREDIT_LENGTH} characters`,
    ],
    [
      'step length',
      MAX_RECIPE_STEP_LENGTH,
      'steps',
      (n) => ({ steps: ['Mix.', 'x'.repeat(n)] }),
      `each step must be at most ${MAX_RECIPE_STEP_LENGTH} characters`,
    ],
    [
      'step count',
      MAX_RECIPE_STEPS,
      'steps',
      (n) => ({ steps: Array.from({ length: n }, () => 'Mix.') }),
      `at most ${MAX_RECIPE_STEPS} steps`,
    ],
    [
      'ingredient item length',
      MAX_INGREDIENT_ITEM_LENGTH,
      'ingredients',
      (n) => ({ ingredients: [{ quantity: 1, unit: null, item: 'x'.repeat(n) }] }),
      `each ingredient item must be at most ${MAX_INGREDIENT_ITEM_LENGTH} characters`,
    ],
    [
      'ingredient unit length',
      MAX_INGREDIENT_UNIT_LENGTH,
      'ingredients',
      (n) => ({ ingredients: [{ quantity: 1, unit: 'x'.repeat(n), item: 'flour' }] }),
      `each ingredient unit must be at most ${MAX_INGREDIENT_UNIT_LENGTH} characters`,
    ],
    [
      'ingredient count',
      MAX_RECIPE_INGREDIENTS,
      'ingredients',
      (n) => ({ ingredients: Array.from({ length: n }, () => ({ quantity: 1, unit: null, item: 'flour' })) }),
      `at most ${MAX_RECIPE_INGREDIENTS} ingredients`,
    ],
    [
      'tag length',
      MAX_RECIPE_TAG_LENGTH,
      'tags',
      (n) => ({ tags: ['x'.repeat(n)] }),
      `each tag must be at most ${MAX_RECIPE_TAG_LENGTH} characters`,
    ],
  ])('%s', (_label, max, path, build, message) => {
    it(`allows ${max} but not ${max + 1}`, () => {
      parsed(validInput(build(max)))
      expectIssueOn(validInput(build(max + 1)), path)
    })

    it('gives a readable message', () => {
      const result = recipeInputSchema.safeParse(validInput(build(max + 1)))
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([message])
    })
  })

  it('counts a padded value after trimming', () => {
    const padded = ` ${'x'.repeat(MAX_RECIPE_DESCRIPTION_LENGTH)} `
    expect(parsed(validInput({ description: padded })).description).toHaveLength(MAX_RECIPE_DESCRIPTION_LENGTH)
  })

  describe('numbers', () => {
    it('coerces numeric strings from form inputs', () => {
      const data = parsed(validInput({ servings: '6', prepTime: '15', cookTime: '0' }))
      expect(data).toMatchObject({ servings: 6, prepTime: 15, cookTime: 0 })
    })

    it.each(['servings', 'prepTime', 'cookTime'])('reports a blank %s instead of reading it as 0', (field) => {
      expectIssueOn(validInput({ [field]: '' }), field)
      expectIssueOn(validInput({ [field]: '  ' }), field)
    })

    it.each([['1.5'], ['-1'], ['abc']])('rejects prepTime %j', (prepTime) => {
      expectIssueOn(validInput({ prepTime }), 'prepTime')
    })

    it.each([['0'], [0], [1.5]])('rejects servings %j, which is not an integer >= 1', (servings) => {
      expectIssueOn(validInput({ servings }), 'servings')
    })
  })

  // Only IDs the upload action produces: one segment inside the upload folder.
  it.each([['recipes/beef-stew'], ['recipes/Abc_12-x']])('accepts the imagePublicId %j', (imagePublicId) => {
    expect(parsed(validInput({ imagePublicId })).imagePublicId).toBe(imagePublicId)
  })

  it.each([
    ['another folder', 'other/beef-stew'],
    ['the old folder', 'recipe-images/x'],
    ['no folder', 'beef-stew'],
    ['a parent segment', 'recipes/../secret'],
    ['a double slash', 'recipes//beef-stew'],
    ['a colon', 'recipes/a:b'],
    ['a full URL', 'https://res.cloudinary.com/demo/image/upload/recipes/beef-stew'],
    ['an empty segment', 'recipes/'],
  ])('rejects an imagePublicId with %s', (_label, imagePublicId) => {
    expectIssueOn(validInput({ imagePublicId }), 'imagePublicId')
  })

  it('rejects a sourceUrl that is not a URL', () => {
    expectIssueOn(validInput({ sourceUrl: 'not a url' }), 'sourceUrl')
  })

  // The recipe page links to sourceUrl, so any other scheme is stored XSS or worse.
  it.each([['javascript:alert(1)'], ['data:text/html,hi'], ['ftp://x'], ['mailto:a@b.c']])('rejects the non-http(s) sourceUrl %j', (sourceUrl) => {
    expectIssueOn(validInput({ sourceUrl }), 'sourceUrl')
  })

  it.each([['http://example.com/stew'], ['https://www.seriouseats.com/beef-stew']])('accepts the sourceUrl %j', (sourceUrl) => {
    expect(parsed(validInput({ sourceUrl })).sourceUrl).toBe(sourceUrl)
  })
})
