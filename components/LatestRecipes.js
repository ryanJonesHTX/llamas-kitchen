import Link from 'next/link'
import Image from 'next/image'

export default function Recipecard({ recipes }) {
  const latestRecipes = recipes
    .sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
    .slice(0, 4)
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl py-16 px-4 sm:py-24 sm:px-6 lg:max-w-7xl lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Latest Recipes
          </h2>
          <Link
            href="/recipes"
            className="hidden text-sm font-medium text-indigo-600 hover:text-indigo-500 md:block"
          >
            See all Recipes
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-4 md:gap-y-0 lg:gap-x-8">
          {latestRecipes.map((recipe) => (
            <div
              key={recipe._id}
              className="group relative"
            >
              <div className="h-56 w-full overflow-hidden rounded-md bg-gray-200 group-hover:opacity-75 lg:h-72 xl:h-80">
                <Image
                  src={recipe.photo}
                  alt={recipe.name}
                  className="h-full w-full object-cover object-center"
                  width={300}
                  height={250}
                />
              </div>
              <h3 className="mt-4 text-sm text-gray-700">
                <Link
                  href="/[id]"
                  as={`/${recipe._id}`}
                >
                  <span className="absolute inset-0" />
                  {recipe.name}
                </Link>
              </h3>
            </div>
          ))}
        </div>

        <div className="mt-8 text-sm md:hidden">
          <Link
            href="/recipes"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            See all Recipes
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
