import { notFound } from 'next/navigation'
import RecipeForm, { type RecipeFormValues } from '../../../../components/RecipeForm'
import SiteHeader from '../../../../components/SiteHeader'
import { requireAdminPage } from '../../../../lib/adminGuard'
import { formatIngredient } from '../../../../lib/recipes/format'
import { getRecipeForEdit, publishedSearchOptions, type RecipeRecord } from '../../../../lib/recipes/queries'

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
  await requireAdminPage(`/recipes/${slug}/edit`)
  const recipe = await getRecipeForEdit(slug)
  if (!recipe) notFound()

  return (
    <>
      <SiteHeader searchOptions={await publishedSearchOptions()} />
      <RecipeForm recipeId={recipe._id.toHexString()} initialValues={formValues(recipe)} />
    </>
  )
}
