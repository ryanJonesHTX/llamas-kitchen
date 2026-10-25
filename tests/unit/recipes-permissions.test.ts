import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import type { Session } from 'next-auth'
import { canEdit, canView } from '../../lib/recipes/permissions'
import type { RecipeStatus } from '../../lib/recipes/model'

const ownerId = new Types.ObjectId('640000000000000000000001')

const sessionFor = (id: string, role: 'user' | 'admin'): Session => ({
  expires: '2999-01-01T00:00:00.000Z',
  user: { id, name: role, email: `${role}@example.com`, image: null, role },
})

const viewers = {
  anonymous: null,
  'another user': sessionFor('640000000000000000000002', 'user'),
  owner: sessionFor(ownerId.toHexString(), 'user'),
  admin: sessionFor('640000000000000000000003', 'admin'),
}

type Viewer = keyof typeof viewers

const recipe = (status: RecipeStatus) => ({ status, submittedBy: ownerId })

// [status, viewer, canView, canEdit]
const cases: [RecipeStatus, Viewer, boolean, boolean][] = [
  ['published', 'anonymous', true, false],
  ['published', 'another user', true, false],
  ['published', 'owner', true, false],
  ['published', 'admin', true, true],
  ['pending', 'anonymous', false, false],
  ['pending', 'another user', false, false],
  ['pending', 'owner', true, true],
  ['pending', 'admin', true, true],
  ['rejected', 'anonymous', false, false],
  ['rejected', 'another user', false, false],
  ['rejected', 'owner', true, true],
  ['rejected', 'admin', true, true],
]

describe.each(cases)('a %s recipe seen by %s', (status, viewer, view, edit) => {
  it(`canView is ${view}`, () => {
    expect(canView(viewers[viewer], recipe(status))).toBe(view)
  })

  it(`canEdit is ${edit}`, () => {
    expect(canEdit(viewers[viewer], recipe(status))).toBe(edit)
  })
})
