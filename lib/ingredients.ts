export type Ingredient = { quantity: number | null; unit: string | null; item: string }

// Single-word units, matched case-insensitively on the whole token.
const UNITS = new Set([
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbs',
  'teaspoon', 'teaspoons', 'tsp', 't',
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
])

const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
  '⅕': 1 / 5,
  '⅙': 1 / 6,
}

const VULGAR = `[${Object.keys(VULGAR_FRACTIONS).join('')}]`

// Whole + vulgar (1½, 1 ½), mixed (1 1/2), fraction, vulgar alone, decimal, integer.
const QUANTITY = `(?:\\d+ ?${VULGAR}|\\d+ \\d+/\\d+|\\d+/\\d+|${VULGAR}|\\d*\\.\\d+|\\d+)`
const LEADING_QUANTITY = new RegExp(`^${QUANTITY}`, 'u')
// Text after a quantity that starts with "-", "–" or "to" and another quantity.
const RANGE_TAIL = new RegExp(`^ ?(?:[-–]|to) ?${QUANTITY}`, 'u')
// A whole number (possibly empty) followed by a vulgar fraction.
const WHOLE_AND_VULGAR = new RegExp(`^(\\d*) ?(${VULGAR})$`, 'u')

// The value of a token matched by QUANTITY; Infinity or NaN for a zero denominator.
function quantityValue(token: string): number {
  const vulgar = token.match(WHOLE_AND_VULGAR)
  if (vulgar) return Number(vulgar[1]) + VULGAR_FRACTIONS[vulgar[2]]
  const fraction = token.match(/^(?:(\d+) )?(\d+)\/(\d+)$/)
  if (fraction) {
    return Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3])
  }
  return Number(token)
}

function isRange(afterQuantity: string): boolean {
  return RANGE_TAIL.test(afterQuantity)
}

// The unit as written (minus one trailing "."), or null if the token isn't a known unit.
function unitFromToken(token: string): string | null {
  const unit = token.endsWith('.') ? token.slice(0, -1) : token
  return UNITS.has(unit.toLowerCase()) ? unit : null
}

// Splits an ingredient line into quantity, unit and item. Lines whose quantity
// can't be read (none, zero, a range, nothing after it) keep the whole line as the item.
export function parseIngredient(line: string): Ingredient {
  const text = line.trim().replace(/\s+/g, ' ')
  if (!text) throw new Error('parseIngredient: blank ingredient line')
  const unparsed: Ingredient = { quantity: null, unit: null, item: text }

  const match = text.match(LEADING_QUANTITY)
  if (!match) return unparsed
  const quantity = quantityValue(match[0])
  if (!Number.isFinite(quantity) || quantity <= 0) return unparsed

  const afterQuantity = text.slice(match[0].length)
  if (isRange(afterQuantity)) return unparsed

  // A token glued to the quantity (250g) must be a unit; a spaced one may be.
  const glued = afterQuantity !== '' && !afterQuantity.startsWith(' ')
  const rest = afterQuantity.trimStart()
  const token = rest.split(' ')[0]
  const unit = unitFromToken(token)
  if (glued && !unit) return unparsed

  const afterUnit = unit ? rest.slice(token.length).trimStart() : rest
  const item = afterUnit.replace(/^of( |$)/i, '')
  if (!item) return unparsed

  return { quantity, unit, item }
}
