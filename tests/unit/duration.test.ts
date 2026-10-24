import { describe, expect, it } from 'vitest'
import { formatMinutes } from '../../lib/recipes/duration'

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [5, '5 min'],
    [59, '59 min'],
    [60, '1 hr'],
    [95, '1 hr 35 min'],
    [120, '2 hr'],
    [135, '2 hr 15 min'],
  ])('formats %j as %j', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text)
  })

  // The model stores whole, non-negative minutes; anything else is a bug upstream.
  it.each([[-1], [1.5], [NaN], [Infinity]])('throws for %j', (minutes) => {
    expect(() => formatMinutes(minutes)).toThrow()
  })
})
