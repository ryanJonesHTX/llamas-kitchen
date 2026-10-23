import { describe, expect, it } from 'vitest'
// The new model is imported before the old one on purpose: if both registered
// as "Recipe" through `mongoose.models.Recipe ||`, the old import would get the new model.
import { Recipe } from '../../lib/recipes/model'
import OldRecipe from '../../models/Recipe.js'
import { recipeDoc, pendingDoc, rejectedDoc } from '../fixtures/recipes'

// Validation rules and indexes from .claude/SCHEMA-PROPOSAL.md, checked
// without a database through validateSync.

type Doc = Record<string, unknown>

function errorPaths(doc: Doc): string[] {
  return Object.keys(new Recipe(doc).validateSync()?.errors ?? {})
}

function expectValid(doc: Doc) {
  expect(errorPaths(doc)).toEqual([])
}

// Fails only on `path` (or paths under it, like ingredients.0.item).
function expectInvalid(doc: Doc, path: string) {
  const paths = errorPaths(doc)
  expect(paths.length, `expected an error on ${path}`).toBeGreaterThan(0)
  for (const p of paths) expect(p === path || p.startsWith(`${path}.`), `unexpected error on ${p}`).toBe(true)
}

function without(key: string, doc: Doc = recipeDoc()): Doc {
  const copy = { ...doc }
  delete copy[key]
  return copy
}

function withIngredient(ingredient: Doc): Doc {
  return recipeDoc({ ingredients: [ingredient] })
}

describe('new Recipe model', () => {
  it('is a separate model from models/Recipe.js while both are loaded', () => {
    expect(Recipe).not.toBe(OldRecipe)
    expect(OldRecipe.schema.path('directions')).toBeDefined()
    expect(Recipe.schema.path('directions')).toBeUndefined()
    expect(Recipe.schema.path('steps')).toBeDefined()
  })

  it('stores recipes in the recipes collection', () => {
    expect(Recipe.collection.collectionName).toBe('recipes')
  })

  it('does not build indexes automatically', () => {
    expect(Recipe.schema.get('autoIndex')).toBe(false)
  })

  it('has createdAt and updatedAt timestamps', () => {
    expect(Recipe.schema.path('createdAt')).toBeDefined()
    expect(Recipe.schema.path('updatedAt')).toBeDefined()
  })

  it('accepts a published recipe with only the required fields', () => {
    expectValid(recipeDoc())
  })

  it('accepts every optional field', () => {
    expectValid(
      recipeDoc({
        imagePublicId: 'recipes/beef-stew',
        notes: 'Better the next day.',
        credit: 'Grandma',
        sourceUrl: 'https://www.seriouseats.com/beef-stew',
      })
    )
  })

  describe('name', () => {
    it.each([['missing', undefined], ['blank', '   ']])('is required (%s)', (_label, name) => {
      expectInvalid(recipeDoc({ name }), 'name')
    })

    it('is trimmed', () => {
      expect(new Recipe(recipeDoc({ name: '  Beef Stew  ' })).name).toBe('Beef Stew')
    })

    it('allows 120 characters but not 121', () => {
      expectValid(recipeDoc({ name: 'x'.repeat(120) }))
      expectInvalid(recipeDoc({ name: 'x'.repeat(121) }), 'name')
    })
  })

  describe('slug', () => {
    it('is required', () => {
      expectInvalid(without('slug'), 'slug')
    })

    it.each([['beef-stew-2'], ['7-layer-dip'], ['pie']])('accepts %j', (slug) => {
      expectValid(recipeDoc({ slug }))
    })

    it.each([['beef stew'], ['beef_stew'], ['beef--stew'], ['-beef'], ['beef-'], ['crème-brûlée']])(
      'rejects %j, which is not lowercase a-z0-9 words joined by single hyphens',
      (slug) => {
        expectInvalid(recipeDoc({ slug }), 'slug')
      }
    )
  })

  describe('description', () => {
    it.each([['missing', undefined], ['blank', '  ']])('is required (%s)', (_label, description) => {
      expectInvalid(recipeDoc({ description }), 'description')
    })

    it('is trimmed', () => {
      expect(new Recipe(recipeDoc({ description: '\tHearty. ' })).description).toBe('Hearty.')
    })
  })

  describe('ingredients', () => {
    it('needs at least one', () => {
      expectInvalid(recipeDoc({ ingredients: [] }), 'ingredients')
    })

    it.each([[0], [-1]])('rejects quantity %j, which is not > 0', (quantity) => {
      expectInvalid(withIngredient({ quantity, unit: 'cup', item: 'flour' }), 'ingredients')
    })

    it('accepts a null quantity and unit', () => {
      expectValid(withIngredient({ quantity: null, unit: null, item: 'Salt to taste' }))
    })

    it('trims the unit and the item', () => {
      const recipe = new Recipe(withIngredient({ quantity: 1, unit: ' cup ', item: '  flour ' }))
      expect(recipe.ingredients[0].unit).toBe('cup')
      expect(recipe.ingredients[0].item).toBe('flour')
    })

    it.each([['missing', undefined], ['blank', '  ']])('requires the item (%s)', (_label, item) => {
      expectInvalid(withIngredient({ quantity: 1, unit: 'cup', item }), 'ingredients')
    })
  })

  describe('steps', () => {
    it('needs at least one', () => {
      expectInvalid(recipeDoc({ steps: [] }), 'steps')
    })

    it('rejects a blank step', () => {
      expectInvalid(recipeDoc({ steps: ['Mix.', '   '] }), 'steps')
    })

    it('trims each step', () => {
      expect([...new Recipe(recipeDoc({ steps: ['  Mix. ', 'Bake.\n'] })).steps]).toEqual(['Mix.', 'Bake.'])
    })
  })

  describe('servings', () => {
    it('is required', () => {
      expectInvalid(without('servings'), 'servings')
    })

    it.each([[0], [1.5], [-2]])('rejects %j, which is not an integer >= 1', (servings) => {
      expectInvalid(recipeDoc({ servings }), 'servings')
    })

    it('accepts 1', () => {
      expectValid(recipeDoc({ servings: 1 }))
    })
  })

  describe.each(['prepTime', 'cookTime'])('%s', (field) => {
    it('is required', () => {
      expectInvalid(without(field), field)
    })

    it.each([[-1], [1.5]])('rejects %j, which is not a whole number of minutes >= 0', (minutes) => {
      expectInvalid(recipeDoc({ [field]: minutes }), field)
    })

    it('accepts 0', () => {
      expectValid(recipeDoc({ [field]: 0 }))
    })
  })

  describe('tags', () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `tag-${i}`)

    it('accepts none', () => {
      expectValid(recipeDoc({ tags: [] }))
    })

    it('allows 10 but not 11', () => {
      expectValid(recipeDoc({ tags: tags(10) }))
      expectInvalid(recipeDoc({ tags: tags(11) }), 'tags')
    })

    it('trims and lowercases each tag', () => {
      expect([...new Recipe(recipeDoc({ tags: [' Dessert ', 'QUICK'] })).tags]).toEqual(['dessert', 'quick'])
    })

    it('rejects duplicates, compared after trimming and lowercasing', () => {
      expectInvalid(recipeDoc({ tags: ['dessert', 'quick', 'dessert'] }), 'tags')
      expectInvalid(recipeDoc({ tags: ['dessert', ' Dessert'] }), 'tags')
    })
  })

  describe('sourceUrl', () => {
    it('rejects a value that is not a URL', () => {
      expectInvalid(recipeDoc({ sourceUrl: 'not a url' }), 'sourceUrl')
    })

    // The recipe page links to sourceUrl, so any other scheme is stored XSS or worse.
    it.each([['javascript:alert(1)'], ['data:text/html,hi'], ['ftp://x'], ['mailto:a@b.c']])('rejects the non-http(s) URL %j', (sourceUrl) => {
      expectInvalid(recipeDoc({ sourceUrl }), 'sourceUrl')
    })

    it.each([['http://example.com/stew'], ['https://www.seriouseats.com/beef-stew']])('accepts %j', (sourceUrl) => {
      expectValid(recipeDoc({ sourceUrl }))
    })
  })

  describe('submittedBy', () => {
    it('is required', () => {
      expectInvalid(without('submittedBy'), 'submittedBy')
    })

    it('is an ObjectId', () => {
      expect(Recipe.schema.path('submittedBy').instance).toBe('ObjectId')
      expectInvalid(recipeDoc({ submittedBy: 'Grandma' }), 'submittedBy')
    })
  })

  describe('status', () => {
    it('is required and has no default', () => {
      const doc = without('status', without('publishedAt'))
      expect(new Recipe(doc).status).toBeUndefined()
      expectInvalid(doc, 'status')
    })

    it('rejects a value outside pending, published and rejected', () => {
      expectInvalid(recipeDoc({ status: 'draft', publishedAt: undefined }), 'status')
    })

    it('accepts pending', () => {
      expectValid(pendingDoc())
    })
  })

  describe('rejectionReason', () => {
    it('is accepted when status is rejected', () => {
      expectValid(rejectedDoc())
    })

    it.each([['missing', undefined], ['blank', '  ']])(
      'is required when status is rejected (%s)',
      (_label, rejectionReason) => {
        expectInvalid(rejectedDoc({ rejectionReason }), 'rejectionReason')
      }
    )

    it.each([
      ['published', recipeDoc({ rejectionReason: 'Nope.' })],
      ['pending', pendingDoc({ rejectionReason: 'Nope.' })],
    ])('is not allowed when status is %s', (_status, doc) => {
      expectInvalid(doc, 'rejectionReason')
    })
  })

  describe('publishedAt', () => {
    it('is required when status is published', () => {
      expectInvalid(without('publishedAt'), 'publishedAt')
    })

    it.each([
      ['pending', pendingDoc({ publishedAt: new Date() })],
      ['rejected', rejectedDoc({ publishedAt: new Date() })],
    ])('is not allowed when status is %s', (_status, doc) => {
      expectInvalid(doc, 'publishedAt')
    })
  })
})

describe('new Recipe indexes', () => {
  // Drops Mongoose-internal options such as `_autoIndex`, which only say how
  // the index was declared.
  const declared = () =>
    Recipe.schema
      .indexes()
      .map(([fields, options]) => [
        fields,
        Object.fromEntries(Object.entries(options ?? {}).filter(([key]) => !key.startsWith('_'))),
      ])

  it('declares exactly the indexes in the proposal', () => {
    const expected = [
      [{ slug: 1 }, { unique: true }],
      [{ status: 1, publishedAt: -1, _id: -1 }, {}],
      [{ tags: 1, status: 1, publishedAt: -1, _id: -1 }, {}],
      [{ status: 1, createdAt: 1 }, {}],
      [{ submittedBy: 1, createdAt: -1 }, {}],
      [
        { name: 'text', 'ingredients.item': 'text', tags: 'text' },
        { weights: { name: 10, 'ingredients.item': 5, tags: 3 } },
      ],
    ]
    const indexes = declared()
    expect(indexes).toHaveLength(expected.length)
    expect(indexes).toEqual(expect.arrayContaining(expected))
  })
})
