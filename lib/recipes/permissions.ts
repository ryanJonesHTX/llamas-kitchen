import type { Session } from 'next-auth'
import { isAdmin } from '../roles'
import type { RecipeRecord } from './model'

// Who may see and edit a recipe. Pages and actions both ask here; no inline role checks.

type Guarded = Pick<RecipeRecord, 'status' | 'submittedBy'>

function isOwner(session: Session | null, recipe: Guarded): boolean {
  return session !== null && session.user.id === String(recipe.submittedBy)
}

export function canView(session: Session | null, recipe: Guarded): boolean {
  return recipe.status === 'published' || isAdmin(session) || isOwner(session, recipe)
}

// Published recipes are admin-only; an owner may fix theirs while it awaits review or after rejection.
export function canEdit(session: Session | null, recipe: Guarded): boolean {
  return isAdmin(session) || ((recipe.status === 'pending' || recipe.status === 'rejected') && isOwner(session, recipe))
}
