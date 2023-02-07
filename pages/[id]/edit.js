import { useRouter } from 'next/router'
import useSWR from 'swr'
import Form from '../../components/Form'

const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((json) => json.data)

const EditRecipe = () => {
  const router = useRouter()
  const { id } = router.query
  const {
    data: recipe,
    error,
    isLoading,
  } = useSWR(id ? `/api/recies/${id}` : null, fetcher)

  if (error) return <p>Failed to load</p>
  if (isLoading) return <p>Loading...</p>
  if (!recipe) return null

  const recipeForm = {
    name: recipe.name,
    description: recipe.description,
    directions: recipe.directions,
    ingredients: recipe.ingredients,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    photo: recipe.photo,
    cloudinaryId: recipe.cloudinaryId,
    category: recipe.category,
    submittedBy: recipe.submittedBy,
    notes: recipe.notes,
  }

  return <Form formId="edit-recipe-form" recipeForm={recipeForm} forNewRecipe={false} />
}

export default EditRecipe
