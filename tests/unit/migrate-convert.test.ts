import { describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  convertRecipe,
  isMigrated,
  migratedRecipeSchema,
} from '../../scripts/migrate-recipes-v2/convert'

// convertRecipe is pure and can't see other documents, so migrate() assigns
// the slug and passes it in: convertRecipe(oldDoc, { adminUserId, slug }).

const adminUserId = new ObjectId('64b000000000000000000001')
const recipeId = new ObjectId('64a000000000000000000001')
const createdAt = new Date('2021-03-04T05:06:07.000Z')
const updatedAt = new Date('2022-01-02T03:04:05.000Z')

type Doc = Record<string, unknown>

function oldRecipe(overrides: Doc = {}): Doc {
  return {
    _id: recipeId,
    name: 'Beef Stew',
    description: 'Hearty and warm.',
    directions: 'Brown the beef.\nSimmer for two hours.',
    ingredients: [
      { id: 'a1', ingredient: '2 cups beef stock' },
      { id: 'a2', ingredient: 'Salt to taste' },
    ],
    prepTime: 20,
    cookTime: 120,
    photo: '',
    cloudinaryId: 'recipes/beef-stew',
    category: 'Main Dish',
    submittedBy: 'Grandma',
    notes: 'Better the next day.',
    createdAt,
    updatedAt,
    __v: 0,
    ...overrides,
  }
}

function withoutKey(key: string): Doc {
  const doc = oldRecipe()
  delete doc[key]
  return doc
}

function convert(doc: Doc, slug = 'beef-stew') {
  return convertRecipe(doc, { adminUserId, slug })
}

function converted(doc: Doc): Doc {
  const result = convert(doc)
  if (!('doc' in result)) {
    throw new Error(`expected a conversion, got problems: ${JSON.stringify(result.problems)}`)
  }
  return result.doc as Doc
}

function problems(doc: Doc): string[] {
  const result = convert(doc)
  if (!('problems' in result)) throw new Error('expected problems, got a conversion')
  expect(result.problems.length).toBeGreaterThan(0)
  return result.problems
}

function expectProblemNaming(doc: Doc, field: string | RegExp) {
  const list = problems(doc)
  const pattern = typeof field === 'string' ? new RegExp(`\\b${field}\\b`) : field
  expect(list.some((problem) => pattern.test(problem)), list.join('; ')).toBe(true)
}

describe('convertRecipe', () => {
  it('converts a clean old recipe to the exact new shape', () => {
    expect(converted(oldRecipe())).toEqual({
      _id: recipeId,
      name: 'Beef Stew',
      slug: 'beef-stew',
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
      imagePublicId: 'recipes/beef-stew',
      notes: 'Better the next day.',
      credit: 'Grandma',
      submittedBy: adminUserId,
      status: 'published',
      publishedAt: createdAt,
      createdAt,
      updatedAt,
      __v: 0,
    })
  })

  it('uses the slug it is given', () => {
    const result = convert(oldRecipe(), 'beef-stew-3')
    expect('doc' in result && result.doc.slug).toBe('beef-stew-3')
  })

  it('keeps _id, createdAt, updatedAt and __v unchanged', () => {
    const doc = converted(oldRecipe({ __v: 3 }))
    expect(doc._id).toBe(recipeId)
    expect(doc.createdAt).toEqual(createdAt)
    expect(doc.updatedAt).toEqual(updatedAt)
    expect(doc.__v).toBe(3)
  })

  it('removes category, directions, photo and cloudinaryId', () => {
    const doc = converted(oldRecipe({ photo: 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg' }))
    for (const key of ['category', 'directions', 'photo', 'cloudinaryId']) {
      expect(doc).not.toHaveProperty(key)
    }
  })

  describe('name and description', () => {
    it('trims them', () => {
      const doc = converted(oldRecipe({ name: '  Beef Stew  ', description: '\tHearty. ' }))
      expect(doc.name).toBe('Beef Stew')
      expect(doc.description).toBe('Hearty.')
    })

    it.each(['name', 'description'])('reports a missing %s', (field) => {
      expectProblemNaming(withoutKey(field), field)
    })

    it.each(['name', 'description'])('reports a blank %s', (field) => {
      expectProblemNaming(oldRecipe({ [field]: '   ' }), field)
    })
  })

  describe('ingredients', () => {
    it('drops blank entries and parses the rest', () => {
      const doc = converted(
        oldRecipe({
          ingredients: [
            { id: 'a', ingredient: '1 1/2 cups flour' },
            { id: 'b', ingredient: '   ' },
            { id: 'c', ingredient: '' },
            { id: 'd', ingredient: '3 eggs' },
          ],
        })
      )
      expect(doc.ingredients).toEqual([
        { quantity: 1.5, unit: 'cups', item: 'flour' },
        { quantity: 3, unit: null, item: 'eggs' },
      ])
    })

    it('reports a recipe whose ingredients are all blank', () => {
      expectProblemNaming(
        oldRecipe({ ingredients: [{ id: 'a', ingredient: ' ' }, { id: 'b', ingredient: '' }] }),
        'ingredients'
      )
    })

    it('reports an empty ingredients array', () => {
      expectProblemNaming(oldRecipe({ ingredients: [] }), 'ingredients')
    })

    it('reports missing ingredients', () => {
      expectProblemNaming(withoutKey('ingredients'), 'ingredients')
    })
  })

  describe('directions to steps', () => {
    it('splits on LF and CRLF, trims, and drops blank lines', () => {
      const doc = converted(
        oldRecipe({ directions: '  Mix.\r\n\r\nBake 30 min.  \n\n   \nServe.\r\n' })
      )
      expect(doc.steps).toEqual(['Mix.', 'Bake 30 min.', 'Serve.'])
    })

    it('reports directions with no non-blank lines', () => {
      expectProblemNaming(oldRecipe({ directions: ' \r\n \n' }), /directions|steps/)
    })

    it('reports missing directions', () => {
      expectProblemNaming(withoutKey('directions'), /directions|steps/)
    })
  })

  describe.each(['prepTime', 'cookTime'])('%s', (field) => {
    it.each([
      [0, 0],
      [45, 45],
      ['15', 15],
    ])('accepts %j as %j minutes', (input, minutes) => {
      expect(converted(oldRecipe({ [field]: input }))[field]).toBe(minutes)
    })

    it('reports it when missing instead of defaulting', () => {
      expectProblemNaming(withoutKey(field), field)
    })

    it.each([[-1], [1.5], ['abc'], [''], [null], ['1.5'], ['-5']])('reports %j', (input) => {
      expectProblemNaming(oldRecipe({ [field]: input }), field)
    })
  })

  describe('category to tags', () => {
    it.each([
      ['Main Dish', ['main dish']],
      ['  Soup  ', ['soup']],
      ['Sweets', ['dessert']],
      ['sweets', ['dessert']],
      ['Dessert', ['dessert']],
      ['DESSERT', ['dessert']],
      ['Select a Category', []],
      ['', []],
      ['   ', []],
    ])('turns %j into %j', (category, tags) => {
      expect(converted(oldRecipe({ category })).tags).toEqual(tags)
    })

    it('gives a recipe without a category no tags', () => {
      expect(converted(withoutKey('category')).tags).toEqual([])
    })
  })

  describe('image', () => {
    it('uses a non-empty cloudinaryId even when photo is set', () => {
      const doc = converted(
        oldRecipe({
          cloudinaryId: 'recipes/stew',
          photo: 'https://res.cloudinary.com/demo/image/upload/v1612345678/other/id.jpg',
        })
      )
      expect(doc.imagePublicId).toBe('recipes/stew')
    })

    it.each([
      ['https://res.cloudinary.com/demo/image/upload/v1612345678/recipes/beef-stew.jpg', 'recipes/beef-stew'],
      ['https://res.cloudinary.com/demo/image/upload/c_fill,w_300,h_200/v1612345678/a/b/c.png', 'a/b/c'],
      ['https://res.cloudinary.com/demo/image/upload/v42/sample.webp', 'sample'],
      ['https://res.cloudinary.com/demo/image/upload/c_fill,w_300/e_sepia/v1/recipes/a.jpg', 'recipes/a'],
      ['https://res.cloudinary.com/demo/image/upload/t_thumb/v1/recipes/a.jpg', 'recipes/a'],
      ['https://res.cloudinary.com/demo/image/upload/v1/my_folder/a.jpg', 'my_folder/a'],
    ])('parses the public ID from photo %s', (photo, publicId) => {
      const doc = converted(oldRecipe({ cloudinaryId: '', photo }))
      expect(doc.imagePublicId).toBe(publicId)
    })

    it('parses photo when cloudinaryId is missing', () => {
      const doc = withoutKey('cloudinaryId')
      doc.photo = 'https://res.cloudinary.com/demo/image/upload/v1/recipes/pie.jpg'
      expect(converted(doc).imagePublicId).toBe('recipes/pie')
    })

    it('leaves imagePublicId absent when both are empty', () => {
      expect(converted(oldRecipe({ cloudinaryId: '', photo: '' }))).not.toHaveProperty('imagePublicId')
    })

    it('leaves imagePublicId absent when both are missing', () => {
      const doc = oldRecipe()
      delete doc.cloudinaryId
      delete doc.photo
      expect(converted(doc)).not.toHaveProperty('imagePublicId')
    })

    it.each([
      ['https://example.com/images/stew.jpg'],
      ['not a url'],
      ['https://res.cloudinary.com/demo/video/upload/v1/clip.mp4'],
      ['https://res.cloudinary.com/demo/image/upload/v1/no-extension'],
      ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    ])('reports an unparseable photo %j', (photo) => {
      expectProblemNaming(oldRecipe({ cloudinaryId: '', photo }), 'photo')
    })
  })

  describe('submittedBy and credit', () => {
    it('moves the old free-text submittedBy to a trimmed credit', () => {
      expect(converted(oldRecipe({ submittedBy: '  Serious Eats ' })).credit).toBe('Serious Eats')
    })

    it.each([[''], ['   ']])('leaves credit absent for %j', (submittedBy) => {
      expect(converted(oldRecipe({ submittedBy }))).not.toHaveProperty('credit')
    })

    it('leaves credit absent when submittedBy is missing', () => {
      expect(converted(withoutKey('submittedBy'))).not.toHaveProperty('credit')
    })

    it('sets submittedBy to the admin user ObjectId', () => {
      const doc = converted(oldRecipe())
      expect(doc.submittedBy).toBeInstanceOf(ObjectId)
      expect(String(doc.submittedBy)).toBe(String(adminUserId))
    })
  })

  describe('notes', () => {
    it('trims them', () => {
      expect(converted(oldRecipe({ notes: '  Freeze leftovers.\n' })).notes).toBe('Freeze leftovers.')
    })

    it.each([[''], ['  ']])('leaves notes absent for %j', (notes) => {
      expect(converted(oldRecipe({ notes }))).not.toHaveProperty('notes')
    })

    it('leaves notes absent when missing', () => {
      expect(converted(withoutKey('notes'))).not.toHaveProperty('notes')
    })
  })

  describe('publishing fields', () => {
    it('sets servings 4, status published and publishedAt to createdAt', () => {
      const doc = converted(oldRecipe())
      expect(doc.servings).toBe(4)
      expect(doc.status).toBe('published')
      expect(doc.publishedAt).toEqual(createdAt)
    })

    it('reports a missing createdAt', () => {
      expectProblemNaming(withoutKey('createdAt'), 'createdAt')
    })
  })

  it('reports an unknown key by name', () => {
    expectProblemNaming(oldRecipe({ rating: 5 }), 'rating')
  })

  it('reports a schema validation failure as a problem instead of throwing', () => {
    // The proposal caps name at 120 characters.
    expect(() => convert(oldRecipe({ name: 'x'.repeat(121) }))).not.toThrow()
    expectProblemNaming(oldRecipe({ name: 'x'.repeat(121) }), 'name')
  })
})

describe('isMigrated', () => {
  it('is true for a converted recipe', () => {
    expect(isMigrated(converted(oldRecipe()))).toBe(true)
  })

  it('is false for an old-shape recipe', () => {
    expect(isMigrated(oldRecipe())).toBe(false)
  })
})

describe('migratedRecipeSchema', () => {
  it('accepts a converted recipe', () => {
    expect(migratedRecipeSchema.safeParse(converted(oldRecipe())).success).toBe(true)
  })

  it('rejects an extra key', () => {
    const doc = { ...converted(oldRecipe()), category: 'Main Dish' }
    expect(migratedRecipeSchema.safeParse(doc).success).toBe(false)
  })

  it.each([['Beef Stew'], ['beef--stew'], ['-beef'], ['beef-'], ['']])(
    'rejects the slug %j',
    (slug) => {
      const doc = { ...converted(oldRecipe()), slug }
      expect(migratedRecipeSchema.safeParse(doc).success).toBe(false)
    }
  )

  it('rejects a string submittedBy', () => {
    const doc = { ...converted(oldRecipe()), submittedBy: String(adminUserId) }
    expect(migratedRecipeSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects a string publishedAt', () => {
    const doc = { ...converted(oldRecipe()), publishedAt: createdAt.toISOString() }
    expect(migratedRecipeSchema.safeParse(doc).success).toBe(false)
  })
})
