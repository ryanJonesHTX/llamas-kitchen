import dbConnect from '../lib/dbConnect'
import Recipe from '../models/Recipe'
import Example from '../components/Example'
import LatestRecipes from '../components/LatestRecipes'

const Index = ( { recipes }) => {
  return (
    <>
      <Example />
      <LatestRecipes 
        recipes={recipes}
      />
    </>
  )
}

// /* Retrieves pet(s) data from mongodb database */
export async function getServerSideProps() {
  await dbConnect()

  /* find all the data in our database */
  const result = await Recipe.find({})
  const recipes = result.map((doc) => {
    const recipe = doc.toObject()
    recipe._id = recipe._id.toString()
    return recipe
  })

  return { props: { recipes: recipes } }
}


export default Index
