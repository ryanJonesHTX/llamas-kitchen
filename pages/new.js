import Form from '../components/Form'

const NewRecipe = () => {
  const recipeForm = {
    name: '',
    description: '',
    ingredients: [],
    prepTime: 0,
    cookTime: 0,
    image: '',
    cloudinaryId: '',
    category: '',
    submittedBy: '',
    notes: '',
  }


  return <Form formId="add-recipe-form" recipeForm={recipeForm}/>
}

export default NewRecipe
