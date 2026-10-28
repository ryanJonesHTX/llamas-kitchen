import { describe, expect, it } from 'vitest'
import { previewCardTitle } from '../../lib/previewImage'

// The title drawn on the link-preview card: only characters the bundled
// Fraunces fonts draw, so next/og never fetches a font or emoji at render.

describe('previewCardTitle', () => {
  it.each([
    ['Beef Stew', 'Beef Stew'],
    ['Pierogi z Łodzi', 'Pierogi z Łodzi'],
    ['Crème brûlée', 'Crème brûlée'],
    ['Şiş kebabı', 'Şiş kebabı'],
    ['Smørrebrød', 'Smørrebrød'],
    ['“Nana’s” pie – 2€', '“Nana’s” pie – 2€'],
  ])('keeps %j as it is', (name, title) => {
    expect(previewCardTitle(name)).toBe(title)
  })

  it('composes decomposed accents rather than dropping them', () => {
    expect(previewCardTitle('Crème brûlée')).toBe('Crème brûlée')
  })

  it.each([
    ['Tacos 🌮🔥', 'Tacos'],
    ['Family 👨‍👩‍👧 dinner', 'Family dinner'],
    ['Thumbs 👍🏽 up', 'Thumbs up'],
    ['Number 1️⃣ chili', 'Number chili'],
    ['Haggis 🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Haggis'],
    ['Hot ♨️ pot', 'Hot pot'],
  ])('strips the emoji from %j', (name, title) => {
    expect(previewCardTitle(name)).toBe(title)
  })

  it('strips control and format characters, keeping words apart that whitespace separated', () => {
    expect(previewCardTitle('Beef\u0007Stew')).toBe('BeefStew')
    expect(previewCardTitle('Sauer­kraut​ and‮ ham')).toBe('Sauerkraut and ham')
    expect(previewCardTitle('Beef\tand\nbarley stew')).toBe('Beef and barley stew')
  })

  it('drops characters the fonts have no glyph for', () => {
    expect(previewCardTitle('שקשוקה Shakshuka')).toBe('Shakshuka')
    expect(previewCardTitle('Mapo tofu 麻婆豆腐')).toBe('Mapo tofu')
    expect(previewCardTitle('Борщ borscht')).toBe('borscht')
  })

  it('collapses the gaps left behind and trims', () => {
    expect(previewCardTitle('  🍕  Pizza  🍕  night  ')).toBe('Pizza night')
  })

  it.each(['🍕🍕🍕', 'שקשוקה', '\u0007​', '   '])('gives %j an empty title', (name) => {
    expect(previewCardTitle(name)).toBe('')
  })
})
