import { describe, expect, it } from 'vitest'
import { parseIngredient } from '../../lib/ingredients'

function expectParsed(
  line: string,
  quantity: number,
  unit: string | null,
  item: string
) {
  const result = parseIngredient(line)
  expect(result.quantity).not.toBeNull()
  expect(result.quantity).toBeCloseTo(quantity, 10)
  expect(result.unit).toBe(unit)
  expect(result.item).toBe(item)
}

function expectUnparsed(line: string) {
  expect(parseIngredient(line)).toEqual({
    quantity: null,
    unit: null,
    item: line.trim().replace(/\s+/g, ' '),
  })
}

describe('parseIngredient', () => {
  describe('rejects blank input', () => {
    it.each([[''], ['   '], ['\t\n ']])('throws for %j', (line) => {
      expect(() => parseIngredient(line)).toThrow()
    })
  })

  it('trims surrounding whitespace from the line', () => {
    expectParsed('  1 lb ground beef  ', 1, 'lb', 'ground beef')
  })

  describe('reads the leading quantity', () => {
    it.each<[string, number, string | null, string]>([
      ['2 eggs', 2, null, 'eggs'],
      ['1.5 cups milk', 1.5, 'cups', 'milk'],
      ['1/2 tsp salt', 0.5, 'tsp', 'salt'],
      ['1/3 cup oil', 1 / 3, 'cup', 'oil'],
      ['1 1/2 cups flour', 1.5, 'cups', 'flour'],
      ['2 2/3 cups oats', 2 + 2 / 3, 'cups', 'oats'],
      ['½ cup sugar', 0.5, 'cup', 'sugar'],
      ['1½ cups sugar', 1.5, 'cups', 'sugar'],
      ['1 ½ cups water', 1.5, 'cups', 'water'],
      ['2 ⅓ cups rice', 2 + 1 / 3, 'cups', 'rice'],
    ])('%j -> quantity %d, unit %j, item %j', (line, quantity, unit, item) => {
      expectParsed(line, quantity, unit, item)
    })
  })

  describe('reads every unicode vulgar fraction as its exact value', () => {
    it.each<[string, number]>([
      ['½', 1 / 2],
      ['⅓', 1 / 3],
      ['⅔', 2 / 3],
      ['¼', 1 / 4],
      ['¾', 3 / 4],
      ['⅛', 1 / 8],
      ['⅜', 3 / 8],
      ['⅝', 5 / 8],
      ['⅞', 7 / 8],
      ['⅕', 1 / 5],
      ['⅙', 1 / 6],
    ])('%s alone', (fraction, value) => {
      expectParsed(`${fraction} cup milk`, value, 'cup', 'milk')
    })

    it.each<[string, number]>([
      ['½', 1 / 2],
      ['⅓', 1 / 3],
      ['⅔', 2 / 3],
      ['¼', 1 / 4],
      ['¾', 3 / 4],
      ['⅛', 1 / 8],
      ['⅜', 3 / 8],
      ['⅝', 5 / 8],
      ['⅞', 7 / 8],
      ['⅕', 1 / 5],
      ['⅙', 1 / 6],
    ])('%s after a whole number, with and without a space', (fraction, value) => {
      expectParsed(`3${fraction} cups milk`, 3 + value, 'cups', 'milk')
      expectParsed(`3 ${fraction} cups milk`, 3 + value, 'cups', 'milk')
    })
  })

  describe('treats a zero quantity as not parsed', () => {
    it.each([['0 eggs'], ['0.0 cups milk'], ['0/2 cup sugar']])(
      '%j',
      (line) => {
        expectUnparsed(line)
      }
    )
  })

  describe('does not parse ranges', () => {
    it.each([
      ['2-3 cloves garlic'],
      ['2–3 cloves garlic'],
      ['2 to 3 cloves garlic'],
      ['1/2-1 cup milk'],
    ])('%j keeps the whole line as the item', (line) => {
      expectUnparsed(line)
    })
  })

  describe('recognises every listed unit', () => {
    it.each([
      'cup', 'cups', 'c',
      'tablespoon', 'tablespoons', 'tbsp', 'tbs',
      'teaspoon', 'teaspoons', 'tsp', 't', 'T',
      'ounce', 'ounces', 'oz',
      'pound', 'pounds', 'lb', 'lbs',
      'gram', 'grams', 'g',
      'kilogram', 'kilograms', 'kg',
      'milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml',
      'liter', 'liters', 'litre', 'litres', 'l',
      'quart', 'quarts', 'qt',
      'pint', 'pints', 'pt',
      'gallon', 'gallons', 'gal',
      'pinch', 'pinches',
      'dash', 'dashes',
      'clove', 'cloves',
      'can', 'cans',
      'package', 'packages', 'pkg',
      'stick', 'sticks',
      'slice', 'slices',
      'sprig', 'sprigs',
      'bunch', 'bunches',
      'head', 'heads',
    ])('%s', (unit) => {
      expectParsed(`2 ${unit} stuff`, 2, unit, 'stuff')
    })
  })

  describe('matches units case-insensitively but stores them as written', () => {
    it.each<[string, number, string, string]>([
      ['2 T butter', 2, 'T', 'butter'],
      ['2 t vanilla', 2, 't', 'vanilla'],
      ['2 CUPS flour', 2, 'CUPS', 'flour'],
      ['1 Lb ground beef', 1, 'Lb', 'ground beef'],
    ])('%j -> unit %j', (line, quantity, unit, item) => {
      expectParsed(line, quantity, unit, item)
    })
  })

  describe('drops one trailing period from the unit', () => {
    it.each<[string, number, string, string]>([
      ['3 Tbsp. oil', 3, 'Tbsp', 'oil'],
      ['1 tsp. salt', 1, 'tsp', 'salt'],
      ['8 oz. cheese', 8, 'oz', 'cheese'],
    ])('%j -> unit %j', (line, quantity, unit, item) => {
      expectParsed(line, quantity, unit, item)
    })
  })

  describe('only matches a unit on the whole token', () => {
    it('reads "cans" as a unit', () => {
      expectParsed('2 cans beans', 2, 'cans', 'beans')
    })

    it('does not read "candles" as a unit', () => {
      expectParsed('2 candles', 2, null, 'candles')
    })

    it('leaves a non-unit word in the item', () => {
      expectParsed('3 large eggs', 3, null, 'large eggs')
    })

    it('does not read a parenthesised size as a unit', () => {
      expectParsed('1 (14 oz) can tomatoes', 1, null, '(14 oz) can tomatoes')
    })
  })

  describe('removes one leading "of " from the item', () => {
    it('strips "of" after a unit', () => {
      expectParsed('2 cups of flour', 2, 'cups', 'flour')
    })

    it('does not strip "of" when it starts a longer word', () => {
      expectParsed('1 lb offal', 1, 'lb', 'offal')
    })
  })

  describe('treats a line with nothing after the quantity and unit as not parsed', () => {
    it.each([['2 cups'], ['1½ cups'], ['  3 tbsp  '], ['2']])('%j', (line) => {
      expectUnparsed(line)
    })
  })

  describe('keeps lines without a leading quantity as the item', () => {
    it.each([
      ['Salt to taste'],
      ['(14 oz) can tomatoes'],
      ['a pinch of salt'],
      ['  Fresh parsley  '],
    ])('%j', (line) => {
      expectUnparsed(line)
    })
  })

  describe('clarifications', () => {
    it('#1 treats a trailing "of" with nothing after it as not parsed', () => {
      expectUnparsed('2 cups of')
    })

    it('#2 strips a leading "of " case-insensitively', () => {
      expectParsed('2 cups Of flour', 2, 'cups', 'flour')
      expectParsed('2 cups OF flour', 2, 'cups', 'flour')
    })

    describe('#3 reads a unit glued to the quantity', () => {
      it.each<[string, number, string, string]>([
        ['250g flour', 250, 'g', 'flour'],
        ['2cups sugar', 2, 'cups', 'sugar'],
        ['1½cups rice', 1.5, 'cups', 'rice'],
      ])('%j -> %d %j %j', (line, quantity, unit, item) => {
        expectParsed(line, quantity, unit, item)
      })

      it('does not parse glued letters that are not a known unit', () => {
        expectUnparsed('2x eggs')
      })
    })

    it('#4 reads a leading-dot decimal', () => {
      expectParsed('.5 cup milk', 0.5, 'cup', 'milk')
    })

    describe('#5 does not parse ranges in any spacing or quantity form', () => {
      it.each([
        ['2 - 3 cloves garlic'],
        ['2 – 3 cloves garlic'],
        ['½-1 cup milk'],
        ['1 1/2-2 cups flour'],
        ['2 to 3 cloves garlic'],
        ['1/2 to 1 cup milk'],
        ['2 to3 cups milk'],
      ])('%j', (line) => {
        expectUnparsed(line)
      })
    })

    it('#6 does not treat a zero denominator as a quantity', () => {
      expectUnparsed('1/0 cup sugar')
    })

    it('#7 reads only the first whole number when two follow each other', () => {
      expectParsed('2 3 eggs', 2, null, '3 eggs')
    })

    describe('#8 collapses runs of whitespace inside the line', () => {
      it('in a parsed item', () => {
        expectParsed('2  cups   all \t purpose  flour', 2, 'cups', 'all purpose flour')
      })

      it('in an unparsed line', () => {
        expect(parseIngredient('  Salt   to\ttaste ')).toEqual({
          quantity: null,
          unit: null,
          item: 'Salt to taste',
        })
      })
    })

    it('#9 does not treat "to" without a following quantity as a range', () => {
      expectParsed('2 to taste', 2, null, 'to taste')
    })

    it('#10 keeps T and t as written', () => {
      expectParsed('1 T sugar', 1, 'T', 'sugar')
      expectParsed('1 t sugar', 1, 't', 'sugar')
    })

    it('#11 treats a lone number as not parsed', () => {
      expectUnparsed('2')
    })
  })
})
