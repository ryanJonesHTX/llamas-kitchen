import Image from 'next/image'
import Link from 'next/link'
import { auth } from '../auth'
import { recipeImageUrl } from '../lib/recipes/image'
import { latestPublished, type RecipeRecord } from '../lib/recipes/queries'
import { isAdmin } from '../lib/roles'

const heroImage = 'https://res.cloudinary.com/dhcbfbegu/image/upload/v1676182454/llama_rmoylj.webp'

export default async function HomePage() {
  const [session, recipes] = await Promise.all([auth(), latestPublished(4)])
  const admin = isAdmin(session)
  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <Hero admin={admin} />
      <LatestRecipes recipes={recipes} admin={admin} />
    </main>
  )
}

function Hero({ admin }: { admin: boolean }) {
  return (
    <section className="grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
      <div className="max-w-xl">
        <h1 className="font-display text-5xl font-semibold tracking-tight text-balance text-text sm:text-6xl">
          Llama's Kitchen
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted">
          A collection of recipes acquired from friends, family and discovered as we go along! Please feel free to add
          your personal favorites for us to try.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/recipes"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-base font-semibold text-on-primary shadow-xs hover:bg-primary/90"
          >
            Browse recipes
          </Link>
          {admin && (
            <Link
              href="/new"
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-5 text-base font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft"
            >
              Add a recipe
            </Link>
          )}
        </div>
      </div>
      {/* The soft block sits offset behind the photo; the padding keeps it inside the column. */}
      <div className="relative pb-4 pr-4 sm:pb-6 sm:pr-6">
        <div aria-hidden="true" className="absolute inset-0 top-4 left-4 rounded-3xl bg-primary-soft sm:top-6 sm:left-6" />
        <Image
          className="relative aspect-4/3 w-full rounded-3xl object-cover"
          src={heroImage}
          alt="Llama's Kitchen"
          width={1200}
          height={900}
          sizes="(min-width: 1024px) 50vw, 100vw"
          preload
        />
      </div>
    </section>
  )
}

// `recipes` arrive newest first, already limited to the latest few.
function LatestRecipes({ recipes, admin }: { recipes: RecipeRecord[]; admin: boolean }) {
  return (
    <section aria-labelledby="latest-heading" className="border-t border-border pt-12 sm:pt-16">
      <div className="flex items-baseline justify-between gap-x-4">
        <h2 id="latest-heading" className="font-display text-3xl font-semibold tracking-tight text-text">
          Latest recipes
        </h2>
        {recipes.length > 0 && (
          <Link href="/recipes" className="shrink-0 text-sm font-semibold text-accent hover:underline">
            See all recipes
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        )}
      </div>

      {recipes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-base text-muted">No recipes yet.</p>
          {admin && (
            <Link href="/new" className="mt-4 inline-block font-semibold text-accent hover:underline">
              Add the first recipe
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-4 lg:gap-x-8">
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
      )}
    </section>
  )
}
