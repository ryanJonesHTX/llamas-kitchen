import { notFound } from 'next/navigation'
import RecipeForm, { type RecipeFormValues } from '../../../../components/RecipeForm'
import { requireUserPage } from '../../../../lib/guards'
import { formatIngredient } from '../../../../lib/recipes/format'
import { recipeImageUrlPrefix } from '../../../../lib/recipes/image'
import { canEdit } from '../../../../lib/recipes/permissions'
import { getRecipeBySlug, type RecipeRecord } from '../../../../lib/recipes/queries'
import { isAdmin } from '../../../../lib/roles'

// The form's text fields, filled from the stored recipe. sourceUrl and
// imagePublicId have no text field; carrying them through keeps an edit from unsetting them.
function formValues(recipe: RecipeRecord): RecipeFormValues {
  return {
    name: recipe.name,
    slug: recipe.slug,
    description: recipe.description,
    ingredients: recipe.ingredients.map((ingredient) => ({ line: formatIngredient(ingredient) })),
    steps: recipe.steps.join('\n'),
    tags: recipe.tags.join(', '),
    servings: String(recipe.servings),
    prepTime: String(recipe.prepTime),
    cookTime: String(recipe.cookTime),
    notes: recipe.notes ?? '',
    credit: recipe.credit ?? '',
    imagePublicId: recipe.imagePublicId,
    sourceUrl: recipe.sourceUrl,
  }
}

export default async function EditRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await requireUserPage(`/recipes/${slug}/edit`)
  const recipe = await getRecipeBySlug(slug)
  // The same 404 for a missing recipe and one this user may not edit.
  if (!recipe || !canEdit(session, recipe)) notFound()

  return (
    <RecipeForm
      admin={isAdmin(session)}
      recipeId={recipe._id.toHexString()}
      status={recipe.status}
      rejectionReason={recipe.rejectionReason}
      initialValues={formValues(recipe)}
      imageUrlPrefix={recipeImageUrlPrefix('card')}
    />
  )
}
