import type { Metadata } from 'next'
import RecipeForm from '../../components/RecipeForm'
import { requireUserPage } from '../../lib/guards'
import { recipeImageUrlPrefix } from '../../lib/recipes/image'
import { isAdmin } from '../../lib/roles'

export const metadata: Metadata = { title: 'Llamas Kitchen - Add Recipe' }

export default async function NewRecipePage() {
  const session = await requireUserPage('/new')
  return <RecipeForm admin={isAdmin(session)} imageUrlPrefix={recipeImageUrlPrefix('card')} />
}
