import { UNIT_FORMS, type Ingredient } from '../ingredients'
import { formatIngredient } from './format'

// Units shown as whole numbers when scaled (250 g, not 250 1/8 g).
const WHOLE_NUMBER_UNITS = new Set([
  'g', 'gram', 'grams', 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres',
])

// Lower-case word unit -> [singular, plural].
const FORMS_BY_UNIT = new Map(UNIT_FORMS.flatMap((forms) => forms.map((unit) => [unit, forms] as const)))

// Grams/millilitres and amounts of 10 or more as whole numbers (at least 1);
// smaller amounts as the nearest eighth or third (ties go up), never 0.
function scaledAmount(raw: number, unit: string | null): number {
  // Rounding from just above the raw amount keeps float noise from pushing a tie down.
  const amount = raw + 1e-9
  if (unit !== null && WHOLE_NUMBER_UNITS.has(unit.toLowerCase())) return Math.max(1, Math.round(amount))
  if (raw >= 10) return Math.round(amount)
  const eighths = Math.round(amount * 8) / 8
  const thirds = Math.round(amount * 3) / 3
  const nearest = Math.abs(thirds - amount) < Math.abs(eighths - amount) ? thirds : eighths
  return nearest === 0 ? 1 / 8 : nearest
}

// A word unit in the form that fits the amount, keeping a capital first letter;
// abbreviations and unknown units as stored.
function unitFor(unit: string, amount: number): string {
  const forms = FORMS_BY_UNIT.get(unit.toLowerCase())
  if (!forms) return unit
  const word = amount > 1 ? forms[1] : forms[0]
  return unit[0] === unit[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word
}

// The recipe page's ingredient line at factor = chosen servings / recipe servings.
// The item text is never changed and units are never converted.
export function scaleIngredientLine(ingredient: Ingredient, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`scaleIngredientLine: expected a positive finite factor, got ${factor}`)
  }
  const { quantity, unit, item } = ingredient
  if (factor === 1 || quantity === null) return formatIngredient(ingredient)
  const amount = scaledAmount(quantity * factor, unit)
  return formatIngredient({ quantity: amount, unit: unit === null ? null : unitFor(unit, amount), item })
}
