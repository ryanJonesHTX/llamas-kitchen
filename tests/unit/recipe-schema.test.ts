import { describe, expect, it } from 'vitest'
import { recipeInputSchema } from '../../lib/recipeSchema'

const validRecipe = {
  name: 'Pancakes',
  description: 'Fluffy breakfast pancakes',
  directions: 'Mix everything and fry.',
  ingredients: [
    { id: 0, ingredient: 'flour' },
    { id: 1, ingredient: 'milk' },
  ],
  prepTime: 10,
  cookTime: 15,
  photo: 'https://res.cloudinary.com/demo/image/upload/pancakes.jpg',
  cloudinaryId: 'pancakes',
  category: 'Dessert',
  submittedBy: 'Llama',
  notes: 'Serve warm.',
}

function without(field: keyof typeof validRecipe) {
  const { [field]: _omitted, ...rest } = validRecipe
  return rest
}

function fieldErrors(input: unknown) {
  const result = recipeInputSchema.safeParse(input)
  expect(result.success).toBe(false)
  return result.success ? {} : result.error.flatten().fieldErrors
}

describe('recipeInputSchema', () => {
  it('accepts a valid recipe', () => {
    expect(recipeInputSchema.parse(validRecipe)).toEqual(validRecipe)
  })

  it('strips _id, createdAt and unknown keys instead of rejecting them', () => {
    const parsed = recipeInputSchema.parse({
      ...validRecipe,
      _id: '65f000000000000000000000',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      __v: 3,
      isAdmin: true,
    })
    expect(parsed).toEqual(validRecipe)
  })

  it.each([
    'name',
    'description',
    'directions',
    'ingredients',
    'prepTime',
    'cookTime',
  ] as const)('rejects a recipe with %s missing', (field) => {
    expect(fieldErrors(without(field))).toHaveProperty(field)
  })

  it.each(['name', 'description', 'directions'] as const)(
    'rejects a whitespace-only %s',
    (field) => {
      expect(fieldErrors({ ...validRecipe, [field]: '   ' })).toHaveProperty(field)
    },
  )

  it('trims required text fields', () => {
    const parsed = recipeInputSchema.parse({ ...validRecipe, name: '  Pancakes  ' })
    expect(parsed.name).toBe('Pancakes')
  })

  it('rejects an empty ingredients list', () => {
    expect(fieldErrors({ ...validRecipe, ingredients: [] })).toHaveProperty('ingredients')
  })

  it('rejects an ingredient with blank text', () => {
    const errors = fieldErrors({ ...validRecipe, ingredients: [{ id: 0, ingredient: '  ' }] })
    expect(errors).toHaveProperty('ingredients')
  })

  it('coerces number-input strings like "30" to numbers', () => {
    const parsed = recipeInputSchema.parse({ ...validRecipe, prepTime: '30', cookTime: '45' })
    expect(parsed.prepTime).toBe(30)
    expect(parsed.cookTime).toBe(45)
  })

  it.each([
    ['prepTime', -1],
    ['prepTime', 2.5],
    ['cookTime', -5],
    ['cookTime', '1.5'],
  ] as const)('rejects %s of %s (negative or non-integer)', (field, value) => {
    expect(fieldErrors({ ...validRecipe, [field]: value })).toHaveProperty(field)
  })

  it('rejects a category that is not one of the form options', () => {
    expect(fieldErrors({ ...validRecipe, category: 'Breakfast' })).toHaveProperty('category')
  })

  it.each([
    'Chicken',
    'Beef',
    'Pork',
    'Seafood',
    'Vegetarian',
    'Pasta',
    'Pizza',
    'Holiday',
    'Dessert',
    'Sides',
  ])('accepts the form category %s', (category) => {
    expect(recipeInputSchema.parse({ ...validRecipe, category }).category).toBe(category)
  })

  it('rejects a photo that is not a URL', () => {
    expect(fieldErrors({ ...validRecipe, photo: 'not a url' })).toHaveProperty('photo')
  })

  it('treats empty-string optional fields as absent', () => {
    const parsed = recipeInputSchema.parse({
      ...validRecipe,
      photo: '',
      cloudinaryId: '',
      category: '',
      submittedBy: '',
      notes: '',
    })
    expect(parsed.photo).toBeUndefined()
    expect(parsed.cloudinaryId).toBeUndefined()
    expect(parsed.category).toBeUndefined()
    expect(parsed.submittedBy).toBeUndefined()
    expect(parsed.notes).toBeUndefined()
  })

  it('treats whitespace-only optional fields as absent', () => {
    const parsed = recipeInputSchema.parse({
      ...validRecipe,
      photo: '  ',
      cloudinaryId: '  ',
      category: '  ',
      submittedBy: '  ',
      notes: '  ',
    })
    expect(parsed.photo).toBeUndefined()
    expect(parsed.cloudinaryId).toBeUndefined()
    expect(parsed.category).toBeUndefined()
    expect(parsed.submittedBy).toBeUndefined()
    expect(parsed.notes).toBeUndefined()
  })

  it('accepts a recipe with every optional field omitted', () => {
    const minimal = {
      name: validRecipe.name,
      description: validRecipe.description,
      directions: validRecipe.directions,
      ingredients: validRecipe.ingredients,
      prepTime: validRecipe.prepTime,
      cookTime: validRecipe.cookTime,
    }
    expect(recipeInputSchema.parse(minimal)).toEqual(minimal)
  })
})
