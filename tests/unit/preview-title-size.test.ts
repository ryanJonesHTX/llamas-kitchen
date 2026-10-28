import { describe, expect, it } from 'vitest'
import { MAX_RECIPE_NAME_LENGTH } from '../../lib/constants'
import { previewTitleSize } from '../../lib/previewImage'

// The title's font size on the generated link-preview card: smaller for
// longer names, so a long name still fits the 1200x630 card.

const nameOf = (length: number) => 'a'.repeat(length)

describe('previewTitleSize', () => {
  it.each<[number, number]>([
    [1, 72],
    [15, 72],
    [30, 72],
    [31, 60],
    [60, 60],
    [61, 48],
    [MAX_RECIPE_NAME_LENGTH, 48],
  ])('gives a %i-character name a %ipx title', (length, size) => {
    expect(previewTitleSize(nameOf(length))).toBe(size)
  })

  it('never grows as the name gets longer', () => {
    for (let length = 2; length <= MAX_RECIPE_NAME_LENGTH; length++) {
      expect(previewTitleSize(nameOf(length))).toBeLessThanOrEqual(previewTitleSize(nameOf(length - 1)))
    }
  })
})
