import type { Metadata } from 'next'
import RecipeForm from '../../components/RecipeForm'
import { requireAdminPage } from '../../lib/adminGuard'
import { recipeImageUrlPrefix } from '../../lib/recipes/image'

export const metadata: Metadata = { title: 'Llamas Kitchen - Add Recipe' }

export default async function NewRecipePage() {
  await requireAdminPage('/new')
  return <RecipeForm imageUrlPrefix={recipeImageUrlPrefix('card')} />
}
