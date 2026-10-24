import Image from 'next/image'
import Link from 'next/link'
import { auth } from '../auth'
import { recipeImageUrl } from '../lib/recipes/image'
import { latestPublished, type RecipeRecord } from '../lib/recipes/queries'
import { isAdmin } from '../lib/roles'

const heroImage = 'https://res.cloudinary.com/dhcbfbegu/image/upload/v1676182454/llama_rmoylj.webp'

export default async function HomePage() {
  const [session, recipes] = await Promise.all([auth(), latestPublished(4)])
  return (
    <main>
      <Hero admin={isAdmin(session)} />
      <LatestRecipes recipes={recipes} />
    </main>
  )
}

function Hero({ admin }: { admin: boolean }) {
  return (
    <div className="relative bg-bg">
      <div className="mx-auto max-w-7xl">
        <div className="relative z-10 lg:w-full lg:h-full lg:max-w-2xl">
          <svg
            className="absolute inset-y-0 right-8 hidden h-full w-80 translate-x-1/2 transform fill-bg lg:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon points="0,0 90,0 50,100 0,100" />
          </svg>

          <div className="relative py-32 px-6 sm:py-40 lg:py-56 lg:px-8 lg:pr-0">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
              <h1 className="font-display text-4xl font-bold tracking-tight text-text sm:text-6xl">Llama's Kitchen</h1>
              <p className="mt-6 text-lg leading-8 text-muted">
                A collection of recipes acquired from friends, family and discovered as we go along! Please feel free
                to add your personal favorites for us to try.
              </p>
              <div className="mt-10 flex items-center gap-x-6">
                <Link
                  href="/recipes"
                  className="rounded-md bg-primary px-3.5 py-1.5 text-base font-semibold leading-7 text-on-primary shadow-xs hover:bg-primary/90 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  All Recipes
                </Link>
                {admin && (
                  <Link href="/new" className="text-base font-semibold leading-7 text-text">
                    Add Recipe <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-surface lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
        <Image
          className="aspect-4/3 object-cover lg:aspect-auto lg:h-full lg:w-full"
          src={heroImage}
          alt="Llama's Kitchen"
          width={1200}
          height={900}
          sizes="(min-width: 1024px) 50vw, 100vw"
          preload
        />
      </div>
    </div>
  )
}

// `recipes` arrive newest first, already limited to the latest few.
function LatestRecipes({ recipes }: { recipes: RecipeRecord[] }) {
  return (
    <div className="bg-bg">
      <div className="mx-auto max-w-2xl py-16 px-4 sm:py-24 sm:px-6 lg:max-w-7xl lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">Latest Recipes</h2>
          <Link href="/recipes" className="hidden text-sm font-medium text-accent hover:underline md:block">
            See all Recipes
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-4 md:gap-y-0 lg:gap-x-8">
          {recipes.map((recipe) => (
            <div key={String(recipe._id)} className="group relative">
              <div className="h-56 w-full overflow-hidden rounded-md bg-border group-hover:opacity-75 lg:h-72 xl:h-80">
                {recipe.imagePublicId && (
                  <Image
                    src={recipeImageUrl(recipe.imagePublicId, 'card')}
                    alt={recipe.name}
                    className="h-full w-full object-cover object-center"
                    width={300}
                    height={250}
                  />
                )}
              </div>
              <h3 className="mt-4 font-display text-sm text-muted">
                <Link href={`/recipes/${recipe.slug}`}>
                  <span className="absolute inset-0" />
                  {recipe.name}
                </Link>
              </h3>
            </div>
          ))}
        </div>

        <div className="mt-8 text-sm md:hidden">
          <Link href="/recipes" className="font-medium text-accent hover:underline">
            See all Recipes
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
