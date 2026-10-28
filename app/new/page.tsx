import type { Metadata } from 'next'
import RecipeForm from '../../components/RecipeForm'
import { requireUserPage } from '../../lib/guards'
import { recipeImageUrlPrefix } from '../../lib/recipes/image'
import { publishedTagsInUse } from '../../lib/recipes/queries'
import { isAdmin } from '../../lib/roles'

export const metadata: Metadata = { title: 'Add recipe' }

export default async function NewRecipePage() {
  const session = await requireUserPage('/new')
  return (
    <RecipeForm
      admin={isAdmin(session)}
      imageUrlPrefix={recipeImageUrlPrefix('card')}
      tagSuggestions={await publishedTagsInUse()}
    />
  )
}
