import { describe, expect, it } from 'vitest'
import { normalizeTag, recipeInputSchema } from '../../lib/recipes/input'
import { splitTags, suggestTags } from '../../lib/recipes/tags'

// The tag input's helpers (components/TagInput.tsx). normalizeTag is the
// shared rule the input schema stores tags by.

describe('normalizeTag', () => {
  it('trims and lowercases', () => {
    expect(normalizeTag('  Main Dish ')).toBe('main dish')
  })

  it('is the rule the input schema stores tags by', () => {
    const tags = ['  Main Dish ', 'QUICK', 'Ünïcode']
    const parsed = recipeInputSchema.shape.tags.parse(tags)
    expect(parsed).toEqual(tags.map(normalizeTag))
  })
})

describe('splitTags', () => {
  it('splits on commas and normalizes each tag', () => {
    expect(splitTags('Pasta, Bake ,QUICK')).toEqual(['pasta', 'bake', 'quick'])
  })

  it('skips blank pieces', () => {
    expect(splitTags(' , a,, b ,')).toEqual(['a', 'b'])
  })

  it('returns no tags for blank text', () => {
    expect(splitTags('   ')).toEqual([])
  })

  it('keeps duplicates for the caller to report', () => {
    expect(splitTags('a, A')).toEqual(['a', 'a'])
  })
})

describe('suggestTags', () => {
  const inUse = ['beef', 'beef stew', 'chicken', 'corned beef', 'curry', 'pork']

  it('puts tags starting with the text before tags containing it', () => {
    expect(suggestTags('bee', [], inUse, 8)).toEqual(['beef', 'beef stew', 'corned beef'])
  })

  it('leaves out chosen tags', () => {
    expect(suggestTags('bee', ['beef stew'], inUse, 8)).toEqual(['beef', 'corned beef'])
  })

  it('suggests nothing when the typed text is already chosen', () => {
    expect(suggestTags('beef', ['beef'], inUse, 8)).toEqual([])
  })

  it('matches every unchosen tag for empty text', () => {
    expect(suggestTags('', ['curry'], inUse, 8)).toEqual(['beef', 'beef stew', 'chicken', 'corned beef', 'pork'])
  })

  it('returns at most `limit` tags', () => {
    expect(suggestTags('', [], inUse, 2)).toEqual(['beef', 'beef stew'])
  })

  it('returns nothing when no tag matches', () => {
    expect(suggestTags('zucchini', [], inUse, 8)).toEqual([])
  })
})
