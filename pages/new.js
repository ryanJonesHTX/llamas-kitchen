import { useState } from 'react'
import Form from '../components/Form'
import Head from 'next/head'
import NavNosearch from '../components/NavNoSearch'
import { requireAdminPage } from '../lib/requireAdmin'

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

  const chefs = [
    'Guy Fieri',
    'Bobby Flay',
    'Alton Brown',
    'Gordon Ramsay',
    'Giada De Laurentiis',
    'Rachael Ray',
    'J. Kenji Lopez-Alt',
    'Julia Child',
  ]

  const [chef] = useState(() => chefs[Math.floor(Math.random() * chefs.length)])

  return (
    <>
      <Head>
        <title>Llamas Kitchen - Add Recipe</title>
      </Head>
      <NavNosearch />
      <Form
        formId="add-recipe-form"
        recipeForm={recipeForm}
        chef={chef}
      />
    </>
  )
}

export default NewRecipe

export const getServerSideProps = requireAdminPage
