import type { Ingredient } from '../ingredients'

// Fractions parseIngredient reads back exactly, smallest denominator first.
const DENOMINATORS = [2, 3, 4, 8]

// 1.5 -> "1 1/2", 0.75 -> "3/4", 2 -> "2"; anything else as a decimal.
function formatQuantity(quantity: number): string {
  const whole = Math.floor(quantity)
  const fraction = quantity - whole
  for (const denominator of DENOMINATORS) {
    const numerator = Math.round(fraction * denominator)
    if (numerator > 0 && numerator < denominator && Math.abs(fraction - numerator / denominator) < 1e-9) {
      return whole ? `${whole} ${numerator}/${denominator}` : `${numerator}/${denominator}`
    }
  }
  return String(quantity)
}

// The ingredient as one line that parseIngredient turns back into it.
export function formatIngredient({ quantity, unit, item }: Ingredient): string {
  return [quantity === null ? null : formatQuantity(quantity), unit, item]
    .filter((part) => part !== null)
    .join(' ')
}
