import { useState } from 'react'
import Form from '../components/Form'
import Head from 'next/head'
import SiteHeader from '../components/SiteHeader'
import { requireAdminPage } from '../lib/requireAdmin'
import { publishedSearchOptions } from '../lib/searchOptions'

const NewRecipe = ({ searchOptions }) => {
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
      <SiteHeader searchOptions={searchOptions} />
      <Form
        formId="add-recipe-form"
        recipeForm={recipeForm}
        chef={chef}
      />
    </>
  )
}

export default NewRecipe

export async function getServerSideProps(context) {
  const guard = await requireAdminPage(context)
  if (!('props' in guard)) return guard

  return { props: { searchOptions: await publishedSearchOptions() } }
}
