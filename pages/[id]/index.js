import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dbConnect from '../../lib/dbConnect'
import Recipe from '../../models/Recipe'

/* Allows you to view pet card info and delete pet card*/
const RecipePage = ({ recipe }) => {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const handleDelete = async () => {
    const recipeID = router.query.id

    try {
      await fetch(`/api/recipe/${recipeID}`, {
        method: 'Delete',
      })
      router.push('/')
    } catch (error) {
      setMessage('Failed to delete the recipe.')
    }
  }

  return (
    <div className="bg-white">
      <main className="mx-auto mt-8 max-w-2xl px-4 sm:px-6 pb-20 lg:max-w-4xl lg:px-8">
        <div className="mx-auto">
          <h1 className="text-xl font-medium text-gray-900">{recipe.name}</h1>
          <div className="">
            <h2 className="text-sm font-medium text-gray-900">
              Prep Time:{' '}
              <span className="prose prose-sm mt-4 mr-4 pr-4 border-r border-gray-300  text-gray-500">
                {recipe.prepTime}{' '}
              </span>
              Cook Time:{' '}
              <span className="prose prose-sm mt-4 text-gray-500">
                {recipe.cookTime}
              </span>
            </h2>
          </div>
          {/* Image */}
          <div className="mt-8 lg:mt-4">
            <h2 className="sr-only">Image</h2>

            <div className="">
              <img
                src={recipe.photo}
                alt={recipe.name}
                className="rounded-lg"
              />
            </div>
          </div>

          <div className="mt-8">
            {/* Ingredients*/}
            <div>
              <h2 className="text-sm font-medium text-gray-900">Ingredients</h2>

              <div className="prose prose-sm mt-4 text-gray-500">
                <ul role="list">
                  {recipe.ingredients.map((item) => (
                    <li key={item.id}>{item.ingredient}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 border-gray-200 pt-8 border-t">
              <h2 className="text-sm font-medium text-gray-900">Directions</h2>
              <div className="prose prose-sm mt-4 text-gray-500">
                <p className="whitespace-pre-line">{recipe.directions}</p>
              </div>
            </div>
            {recipe.notes && (
              <div className="mt-8 border-gray-200 pt-8 border-t">
                <h2 className="text-sm font-medium text-gray-900">
                  Notes/Tips
                </h2>
                <div className="prose prose-sm mt-4 text-gray-500">
                  <p className="whitespace-pre-line">{recipe.notes}</p>
                </div>
              </div>
            )}
            {recipe.submittedBy && (
              <div className="mt-8 border-gray-200 pt-8 border-t pb-8">
                <h2 className="text-sm font-medium text-gray-900">
                  Submitted by:
                </h2>
                <p className="prose prose-sm text-gray-500">
                  {recipe.submittedBy}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Related products */}
        {/* <section aria-labelledby="related-heading" className="mt-16 sm:mt-24">
          <h2 id="related-heading" className="text-lg font-medium text-gray-900">
            Customers also purchased
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-y-10 gap-x-6 sm:grid-cols-2 lg:grid-cols-4 xl:gap-x-8">
            {relatedProducts.map((relatedProduct) => (
              <div key={relatedProduct.id} className="group relative">
                <div className="min-h-80 aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-md group-hover:opacity-75 lg:aspect-none lg:h-80">
                  <img
                    src={relatedProduct.imageSrc}
                    alt={relatedProduct.imageAlt}
                    className="h-full w-full object-cover object-center lg:h-full lg:w-full"
                  />
                </div>
                <div className="mt-4 flex justify-between">
                  <div>
                    <h3 className="text-sm text-gray-700">
                      <a href={relatedProduct.href}>
                        <span aria-hidden="true" className="absolute inset-0" />
                        {relatedProduct.name}
                      </a>
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{relatedProduct.color}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{relatedProduct.price}</p>
                </div>
              </div>
            ))}
          </div>
        </section> */}
    <Link href="/" className='text-xs mt-8 text-gray-500'>
      Back to Home Page
    </Link>
      </main>
    </div>
  )
}

export async function getServerSideProps({ params }) {
  await dbConnect()

  let recipe = await Recipe.findById(params.id).lean()
  recipe._id = recipe._id.toString()
  recipe = JSON.parse(JSON.stringify(recipe))

  return { props: { recipe } }
}

export default RecipePage
