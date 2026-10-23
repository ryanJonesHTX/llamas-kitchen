import { describe, expect, it } from 'vitest'
import { formatIngredient } from '../../lib/recipes/format'
import { type Ingredient, parseIngredient } from '../../lib/ingredients'

// formatIngredient is the inverse of parseIngredient: the edit form shows
// formatted lines and parses them back on save.

describe('formatIngredient', () => {
  it.each<[string, Ingredient]>([
    ['a whole number and a unit', { quantity: 2, unit: 'cups', item: 'flour' }],
    ['a mixed number', { quantity: 1.5, unit: 'cups', item: 'flour' }],
    ['a half', { quantity: 0.5, unit: 'tsp', item: 'salt' }],
    ['a third', { quantity: 1 / 3, unit: 'cup', item: 'oil' }],
    ['a mixed two-thirds', { quantity: 2 + 2 / 3, unit: 'cups', item: 'oats' }],
    ['a quarter and a whole', { quantity: 1.25, unit: 'lb', item: 'ground beef' }],
    ['three quarters', { quantity: 0.75, unit: 'cup', item: 'milk' }],
    ['a decimal that is not a common fraction', { quantity: 0.3, unit: 'kg', item: 'potatoes' }],
    ['a unit glued to the number when parsed', { quantity: 250, unit: 'g', item: 'butter' }],
    ['no unit', { quantity: 3, unit: null, item: 'eggs' }],
    ['no quantity', { quantity: null, unit: null, item: 'Salt to taste' }],
    ['no quantity with a range in the text', { quantity: null, unit: null, item: '2-3 apples' }],
  ])('round-trips through parseIngredient with %s', (_label, ingredient) => {
    const back = parseIngredient(formatIngredient(ingredient))
    expect(back.unit).toBe(ingredient.unit)
    expect(back.item).toBe(ingredient.item)
    if (ingredient.quantity === null) {
      expect(back.quantity).toBeNull()
    } else {
      expect(back.quantity).toBeCloseTo(ingredient.quantity, 10)
    }
  })

  it.each<[Ingredient, string]>([
    [{ quantity: 2, unit: 'cups', item: 'flour' }, '2 cups flour'],
    [{ quantity: 3, unit: null, item: 'eggs' }, '3 eggs'],
    [{ quantity: null, unit: null, item: 'Salt to taste' }, 'Salt to taste'],
  ])('writes %j as %j', (ingredient, line) => {
    expect(formatIngredient(ingredient)).toBe(line)
  })
})
