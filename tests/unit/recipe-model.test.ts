import { describe, expect, it } from 'vitest'
import Recipe from '../../models/Recipe.js'

// Characterises the current models/Recipe.js schema (Mongoose 6) without a
// database, as a safety net for the Mongoose 9 upgrade.

const validRecipe = {
  name: 'Pancakes',
  description: 'Fluffy breakfast pancakes',
  directions: 'Mix everything and fry.',
  ingredients: ['flour', 'milk', 'eggs'],
  prepTime: 10,
  cookTime: 15,
  photo: 'https://res.cloudinary.com/demo/image/upload/pancakes.jpg',
  cloudinaryId: 'pancakes',
  category: 'Breakfast',
  submittedBy: 'Llama',
  notes: 'Serve warm.',
}

function errorsFor(fields: Record<string, unknown>) {
  return new Recipe(fields).validateSync()?.errors ?? {}
}

function without(field: keyof typeof validRecipe) {
  const { [field]: _omitted, ...rest } = validRecipe
  return rest
}

describe('Recipe model validation', () => {
  it('accepts a recipe with every field valid', () => {
    expect(new Recipe(validRecipe).validateSync()).toBeUndefined()
  })

  it.each(['name', 'description', 'directions'] as const)(
    'reports %s as required when it is missing',
    (field) => {
      const errors = errorsFor(without(field))
      expect(Object.keys(errors)).toEqual([field])
      expect(errors[field].kind).toBe('required')
    },
  )

  it('reports ingredients as required when it is null', () => {
    const errors = errorsFor({ ...validRecipe, ingredients: null })
    expect(Object.keys(errors)).toEqual(['ingredients'])
    expect(errors.ingredients.kind).toBe('required')
  })

  // Current behaviour: Mongoose defaults a missing array path to [] and an
  // empty array satisfies `required`, so a recipe with no ingredients passes.
  it('accepts a recipe with ingredients missing or empty, because Mongoose defaults arrays to []', () => {
    expect(errorsFor(without('ingredients'))).toEqual({})
    expect(errorsFor({ ...validRecipe, ingredients: [] })).toEqual({})
  })

  it.each(['prepTime', 'cookTime', 'photo', 'cloudinaryId', 'category'] as const)(
    'KNOWN AUDIT BUG (fix in schema redesign): %s is not required because the schema misspells `require`',
    (field) => {
      expect(errorsFor(without(field))).toEqual({})
    },
  )
})
