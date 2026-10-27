import { describe, expect, it } from 'vitest'
import { scaleIngredientLine } from '../../lib/recipes/scale'
import { formatIngredient } from '../../lib/recipes/format'
import type { Ingredient } from '../../lib/ingredients'

// scaleIngredientLine is the recipe page's ingredient line at a scale factor
// (chosen servings / recipe servings). Factors below are written as servings
// ratios on purpose, so float noise (e.g. 1/3 * 1.5) is exercised.

const ing = (quantity: number | null, unit: string | null, item: string): Ingredient => ({
  quantity,
  unit,
  item,
})

describe('scaleIngredientLine', () => {
  describe('the scale factor', () => {
    it.each([0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'throws for a factor of %s',
      (factor) => {
        expect(() => scaleIngredientLine(ing(1, 'cup', 'flour'), factor)).toThrow()
      },
    )

    it('throws for a bad factor even when the line has no quantity', () => {
      expect(() => scaleIngredientLine(ing(null, null, 'salt to taste'), 0)).toThrow()
    })
  })

  describe('at factor 1', () => {
    it.each<Ingredient>([
      ing(2, 'cups', 'flour'),
      ing(1.5, 'cups', 'flour'),
      ing(1 / 3, 'cup', 'oil'),
      ing(0.3, 'kg', 'potatoes'),
      ing(1, 'cups', 'flour'),
      ing(250, 'g', 'butter'),
      ing(3, null, 'eggs'),
      ing(null, null, 'Salt to taste'),
    ])('shows exactly what formatIngredient shows for %j', (ingredient) => {
      expect(scaleIngredientLine(ingredient, 1)).toBe(formatIngredient(ingredient))
    })

    it('keeps a stored decimal and a mismatched plural as they are', () => {
      expect(scaleIngredientLine(ing(0.3, 'kg', 'potatoes'), 1)).toBe('0.3 kg potatoes')
      expect(scaleIngredientLine(ing(1, 'cups', 'flour'), 1)).toBe('1 cups flour')
    })
  })

  describe('a line without a quantity', () => {
    it.each([3, 0.5, 6 / 4, 1 / 4, 7 / 3])('is unchanged at factor %s', (factor) => {
      expect(scaleIngredientLine(ing(null, null, 'salt to taste'), factor)).toBe('salt to taste')
    })
  })

  describe('the brief examples', () => {
    it.each<[string, Ingredient, number, string]>([
      ['1 cup flour doubled', ing(1, 'cup', 'flour'), 2, '2 cups flour'],
      ['2 cups flour halved', ing(2, 'cups', 'flour'), 1 / 2, '1 cup flour'],
      ['1 1/2 tsp salt doubled', ing(1.5, 'tsp', 'salt'), 2, '3 tsp salt'],
      ['1/4 tsp pepper quartered (would be 1/16)', ing(1 / 4, 'tsp', 'pepper'), 1 / 4, '1/8 tsp pepper'],
      ['2 tbsp from 4 to 6 servings', ing(2, 'tbsp', 'butter'), 6 / 4, '3 tbsp butter'],
      ['7 cups doubled', ing(7, 'cups', 'water'), 2, '14 cups water'],
      ['250 g butter from 4 to 6 servings', ing(250, 'g', 'butter'), 6 / 4, '375 g butter'],
      ['salt to taste tripled', ing(null, null, 'salt to taste'), 3, 'salt to taste'],
      ['1 cup to two thirds', ing(1, 'cup', 'sugar'), 2 / 3, '2/3 cup sugar'],
      ['1/3 cup from 4 to 6 servings', ing(1 / 3, 'cup', 'oil'), 6 / 4, '1/2 cup oil'],
    ])('%s', (_label, ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })

    // Item text is never touched, so "eggs" stays plural even at 1.
    it('leaves the item text alone: 3 eggs from 6 to 2 servings is "1 eggs"', () => {
      expect(scaleIngredientLine(ing(3, null, 'eggs'), 2 / 6)).toBe('1 eggs')
    })
  })

  describe('grams and millilitres', () => {
    it.each<[Ingredient, number, string]>([
      [ing(250, 'g', 'butter'), 6 / 4, '375 g butter'],
      [ing(2, 'g', 'yeast'), 1 / 4, '1 g yeast'],
      [ing(0.4, 'g', 'saffron'), 1 / 2, '1 g saffron'],
      [ing(5, 'g', 'salt'), 1 / 2, '3 g salt'],
      [ing(100, 'ml', 'milk'), 1 / 3, '33 ml milk'],
      [ing(200, 'ml', 'stock'), 7 / 3, '467 ml stock'],
      [ing(100, 'G', 'sugar'), 7 / 3, '233 G sugar'],
      [ing(100, 'ML', 'cream'), 6 / 4, '150 ML cream'],
    ])('rounds %j × %s to a whole number, at least 1: %j', (ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })

    it.each<[Ingredient, number, string]>([
      [ing(100, 'grams', 'flour'), 7 / 3, '233 grams flour'],
      [ing(100, 'gram', 'flour'), 6 / 4, '150 grams flour'],
      [ing(3, 'grams', 'salt'), 1 / 4, '1 gram salt'],
      [ing(100, 'milliliters', 'water'), 1 / 3, '33 milliliters water'],
      [ing(100, 'millilitres', 'water'), 1 / 3, '33 millilitres water'],
      [ing(1, 'milliliter', 'vanilla'), 1 / 4, '1 milliliter vanilla'],
      [ing(1, 'millilitre', 'vanilla'), 3, '3 millilitres vanilla'],
      [ing(4, 'Grams', 'salt'), 1 / 4, '1 Gram salt'],
    ])('treats spelled-out %j × %s the same way: %j', (ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })

    it('does not treat kg as grams (it gets fractions)', () => {
      expect(scaleIngredientLine(ing(0.3, 'kg', 'potatoes'), 2)).toBe('5/8 kg potatoes')
    })
  })

  describe('amounts of 10 or more', () => {
    it.each<[Ingredient, number, string]>([
      [ing(7, 'cups', 'water'), 2, '14 cups water'],
      [ing(6, null, 'eggs'), 5 / 3, '10 eggs'],
      [ing(5.2, 'cups', 'water'), 2, '10 cups water'],
      [ing(5, 'cups', 'water'), 5 / 2, '13 cups water'],
      [ing(6, 'tbsp', 'oil'), 7 / 3, '14 tbsp oil'],
    ])('rounds %j × %s to a whole number: %j', (ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })

    // Pinned: the >= 10 rule looks at the raw scaled amount. A raw amount
    // under 10 is rounded to eighths/thirds, which may land on a whole 10.
    it('shows a raw 9.95 as "10" (nearest eighth/third is the whole 10)', () => {
      expect(scaleIngredientLine(ing(19.9, 'tbsp', 'oil'), 1 / 2)).toBe('10 tbsp oil')
    })

    it('shows a raw 9.9 as "9 7/8", not 10', () => {
      expect(scaleIngredientLine(ing(19.8, 'tbsp', 'oil'), 1 / 2)).toBe('9 7/8 tbsp oil')
    })
  })

  describe('amounts under 10', () => {
    it.each<[number, number, string]>([
      [1, 2, '2'],
      [1, 7 / 3, '2 1/3'],
      [1.5, 7 / 3, '3 1/2'],
      [2, 1 / 4, '1/2'],
      [3 / 4, 2 / 3, '1/2'],
      [1, 1 / 3, '1/3'],
      [4, 2 / 3, '2 2/3'],
      [3, 1 / 4, '3/4'],
      [1, 1 / 8, '1/8'],
      [1, 0.3, '1/3'],
      [1, 0.7, '2/3'],
      [1, 0.6, '5/8'],
      [2, 0.6, '1 1/4'],
      [1, 6 / 4, '1 1/2'],
    ])('shows %s × %s as %j (nearest eighth or third)', (quantity, factor, shown) => {
      expect(scaleIngredientLine(ing(quantity, null, 'apples'), factor)).toBe(`${shown} apples`)
    })

    it.each<[number, number]>([
      [1 / 4, 1 / 4],
      [1 / 8, 1 / 4],
      [1, 1 / 100],
    ])('never shows 0: %s × %s is "1/8"', (quantity, factor) => {
      expect(scaleIngredientLine(ing(quantity, 'tsp', 'pepper'), factor)).toBe('1/8 tsp pepper')
    })

    // Pinned: an exact tie between two candidates goes to the larger one.
    it.each<[number, string]>([
      [3 / 16, '1/4'],
      [9 / 16, '5/8'],
      [1 + 1 / 16, '1 1/8'],
      [2 + 15 / 16, '3'],
    ])('breaks an exact tie upward: %s is %j', (amount, shown) => {
      expect(scaleIngredientLine(ing(amount * 2, null, 'apples'), 1 / 2)).toBe(`${shown} apples`)
    })

    // Ties reached through servings ratios, where float noise must not decide them.
    it.each<[number, number, string]>([
      [1 / 3, 17 / 16, '3/8'],
      [5 / 4, 13 / 12, '1 3/8'],
      [11 / 8, 15 / 22, '1'],
      [21 / 8, 17 / 14, '3 1/4'],
    ])('breaks a tie upward despite float noise: %s × %s is %j', (quantity, factor, shown) => {
      expect(scaleIngredientLine(ing(quantity, null, 'apples'), factor)).toBe(`${shown} apples`)
    })
  })

  describe('singular and plural units', () => {
    const pairs: [string, string][] = [
      ['cup', 'cups'],
      ['tablespoon', 'tablespoons'],
      ['teaspoon', 'teaspoons'],
      ['ounce', 'ounces'],
      ['pound', 'pounds'],
      ['gram', 'grams'],
      ['kilogram', 'kilograms'],
      ['milliliter', 'milliliters'],
      ['millilitre', 'millilitres'],
      ['liter', 'liters'],
      ['litre', 'litres'],
      ['quart', 'quarts'],
      ['pint', 'pints'],
      ['gallon', 'gallons'],
      ['pinch', 'pinches'],
      ['dash', 'dashes'],
      ['clove', 'cloves'],
      ['can', 'cans'],
      ['package', 'packages'],
      ['stick', 'sticks'],
      ['slice', 'slices'],
      ['sprig', 'sprigs'],
      ['bunch', 'bunches'],
      ['head', 'heads'],
    ]

    it.each(pairs)('uses "%s" at exactly 1 and "%s" above 1', (singular, plural) => {
      expect(scaleIngredientLine(ing(4, plural, 'x'), 1 / 4)).toBe(`1 ${singular} x`)
      expect(scaleIngredientLine(ing(1, singular, 'x'), 2)).toBe(`2 ${plural} x`)
    })

    it.each<[Ingredient, number, string]>([
      [ing(1, 'cups', 'milk'), 1 / 2, '1/2 cup milk'],
      [ing(1, 'tablespoons', 'oil'), 1 / 3, '1/3 tablespoon oil'],
      [ing(1, 'cup', 'milk'), 6 / 4, '1 1/2 cups milk'],
      [ing(1, 'pinch', 'salt'), 7 / 3, '2 1/3 pinches salt'],
    ])('uses the singular for fractions up to 1 and the plural above: %j × %s', (ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })

    // Pinned: the new form is lower case, with the first letter capitalised
    // when the stored unit's first letter was.
    it.each<[Ingredient, number, string]>([
      [ing(1, 'Cup', 'flour'), 2, '2 Cups flour'],
      [ing(2, 'Cups', 'flour'), 1 / 2, '1 Cup flour'],
      [ing(1, 'Bunch', 'parsley'), 2, '2 Bunches parsley'],
      [ing(2, 'CUPS', 'flour'), 1 / 2, '1 Cup flour'],
      [ing(1, 'cUP', 'flour'), 2, '2 cups flour'],
    ])('keeps the first letter\'s case: %j × %s', (ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })

    it.each<[Ingredient, number, string]>([
      [ing(1, 'tsp', 'salt'), 3, '3 tsp salt'],
      [ing(1, 'tbsp', 'oil'), 2, '2 tbsp oil'],
      [ing(1, 'tbs', 'oil'), 2, '2 tbs oil'],
      [ing(1, 'oz', 'cheese'), 2, '2 oz cheese'],
      [ing(1, 'lb', 'beef'), 3, '3 lb beef'],
      [ing(2, 'lbs', 'beef'), 1 / 4, '1/2 lbs beef'],
      [ing(1, 'kg', 'flour'), 2, '2 kg flour'],
      [ing(1, 'l', 'water'), 2, '2 l water'],
      [ing(1, 'qt', 'stock'), 2, '2 qt stock'],
      [ing(1, 'pt', 'cream'), 2, '2 pt cream'],
      [ing(1, 'gal', 'water'), 2, '2 gal water'],
      [ing(1, 'pkg', 'yeast'), 2, '2 pkg yeast'],
      [ing(1, 'c', 'flour'), 2, '2 c flour'],
      [ing(1, 't', 'salt'), 2, '2 t salt'],
      [ing(1, 'T', 'butter'), 2, '2 T butter'],
      [ing(1, 'Tbsp', 'butter'), 2, '2 Tbsp butter'],
      [ing(1, 'handful', 'spinach'), 2, '2 handful spinach'],
    ])('leaves abbreviations and unknown units as stored: %j × %s', (ingredient, factor, line) => {
      expect(scaleIngredientLine(ingredient, factor)).toBe(line)
    })
  })

  it('does not convert units: 8 tsp tripled is 24 tsp', () => {
    expect(scaleIngredientLine(ing(8, 'tsp', 'sugar'), 3)).toBe('24 tsp sugar')
  })
})
