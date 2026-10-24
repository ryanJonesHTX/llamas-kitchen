import Head from 'next/head'
import LatestRecipes from '../components/LatestRecipes'
import Landing from '../components/Landing'
import { recipeImageUrl } from '../lib/recipes/image'
import { latestPublished, publishedSearchOptions } from '../lib/recipes/queries'

const Index = ({ recipes, searchOptions }) => {
  return (
    <>
      <Head>
        <title>Llamas Kitchen</title>
      </Head>
      <Landing searchOptions={searchOptions} />
      <LatestRecipes recipes={recipes} />
    </>
  )
}

// The four newest published recipes, as plain props.
export async function getServerSideProps() {
  const recipes = (await latestPublished(4)).map((recipe) => ({
    _id: String(recipe._id),
    name: recipe.name,
    slug: recipe.slug,
    imageUrl: recipe.imagePublicId ? recipeImageUrl(recipe.imagePublicId, 'card') : null,
  }))
  const searchOptions = await publishedSearchOptions()

  return { props: { recipes, searchOptions } }
}

export default Index
