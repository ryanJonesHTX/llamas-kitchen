import Form from '../components/Form'
import Head from 'next/head'
import NavNosearch from '../components/NavNoSearch'


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

  return(
  <>
    <Head>
      <title>Llamas Kitchen - Add Recipe</title>
    </Head>
    <NavNosearch />
    <Form formId="add-recipe-form" recipeForm={recipeForm} />
  </>
)}

export default NewRecipe
