import { describe, expect, it } from 'vitest'
import { slugify } from '../../lib/slugify'

describe('slugify', () => {
  it.each([
    ['Beef Stew', 'beef-stew'],
    ['Mac & Cheese', 'mac-and-cheese'],
    ['Crème brûlée', 'creme-brulee'],
    ["  Grandma's  Pie!! ", 'grandmas-pie'],
    ['Grandma’s Pie', 'grandmas-pie'],
    ['7 Layer Dip 2', '7-layer-dip-2'],
    ['--Spicy___Wings--', 'spicy-wings'],
  ])('turns %j into %j', (name, slug) => {
    expect(slugify(name)).toBe(slug)
  })

  it('does not cap the length', () => {
    const name = 'a'.repeat(300)
    expect(slugify(name)).toBe(name)
  })

  it.each([['🍰🍰'], ['!!! ???'], ['']])('throws when %j leaves nothing to slug', (name) => {
    expect(() => slugify(name)).toThrow()
  })
})
