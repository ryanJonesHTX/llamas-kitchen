import dbConnect from '../lib/dbConnect'
import Recipe from '../models/Recipe'
import Head from 'next/head'
import LatestRecipes from '../components/LatestRecipes'
import Landing from '../components/Landing'

const Index = ({ recipes }) => {
  return (
    <>
      <Head>
        <title>Llamas Kitchen</title>
      </Head>
      <Landing recipes={recipes}/>
      <LatestRecipes recipes={recipes} />
    </>
  )
}

// /* Retrieves recipe data from mongodb database */
export async function getServerSideProps() {
  try {
    await dbConnect()

    /* find all the data in our database */
    const result = await Recipe.find({})
    const recipes = result.map((doc) => {
      const recipe = doc.toObject()
      recipe._id = recipe._id.toString()
      return JSON.parse(JSON.stringify(recipe))
    })

    return { props: { recipes: recipes } }
  } catch (e) {
    console.error(e)
    return { props: {} }
  }
}

export default Index
