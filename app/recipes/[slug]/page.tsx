import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '../../../auth'
import { formatIngredient } from '../../../lib/recipes/format'
import { recipeImageUrl } from '../../../lib/recipes/image'
import { getPublishedBySlug } from '../../../lib/recipes/queries'
import { isAdmin } from '../../../lib/roles'

const HEADING = 'font-display text-sm font-medium text-text'
const SECTION = 'mt-8 border-border pt-8 border-t'

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const recipe = await getPublishedBySlug(slug)
  if (!recipe) notFound()
  const session = await auth()

  return (
    <div className="bg-bg">
      <main className="mx-auto mt-8 max-w-2xl px-4 sm:px-6 pb-20 lg:max-w-4xl lg:px-8">
        <div className="mx-auto">
          <div className="flex items-baseline justify-between">
            <h1 className="font-display text-xl font-medium text-text">{recipe.name}</h1>
            {isAdmin(session) && (
              <Link
                href={`/recipes/${recipe.slug}/edit`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Edit
              </Link>
            )}
          </div>
          <p className="prose prose-sm mt-2 text-muted">{recipe.description}</p>
          <p className="mt-4 text-sm font-medium text-text">
            Prep Time:{' '}
            <span className="prose prose-sm mt-4 mr-4 pr-4 border-r border-border-strong text-muted">
              {recipe.prepTime}{' '}
            </span>
            Cook Time: <span className="prose prose-sm mt-4 mr-4 pr-4 border-r border-border-strong text-muted">{recipe.cookTime}</span>
            <span className="text-muted">Serves {recipe.servings}</span>
          </p>

          {recipe.imagePublicId && (
            <div className="mt-8 lg:mt-4 max-w-2xl lg:max-w-4xl">
              <Image
                src={recipeImageUrl(recipe.imagePublicId, 'hero')}
                alt={recipe.name}
                width={700}
                height={600}
                className="rounded-lg"
              />
            </div>
          )}

          <div className="mt-8">
            <h2 id="ingredients-heading" className={HEADING}>
              Ingredients
            </h2>
            <ul role="list" aria-labelledby="ingredients-heading" className="prose prose-sm mt-4 text-muted">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index}>{formatIngredient(ingredient)}</li>
              ))}
            </ul>
          </div>

          <div className={SECTION}>
            <h2 id="steps-heading" className={HEADING}>
              Steps
            </h2>
            <ol role="list" aria-labelledby="steps-heading" className="prose prose-sm mt-4 text-muted list-decimal">
              {recipe.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>

          {recipe.notes && (
            <div className={SECTION}>
              <h2 className={HEADING}>Notes/Tips</h2>
              <p className="prose prose-sm mt-4 text-muted whitespace-pre-line">{recipe.notes}</p>
            </div>
          )}

          {recipe.tags.length > 0 && (
            <div className={SECTION}>
              <h2 id="tags-heading" className={HEADING}>
                Tags
              </h2>
              <ul role="list" aria-labelledby="tags-heading" className="mt-4 flex flex-wrap gap-2">
                {recipe.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full py-1 px-3 text-sm leading-6 text-muted ring-1 ring-border"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.sourceUrl && (
            <div className={SECTION}>
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-accent hover:underline"
              >
                Source
              </a>
            </div>
          )}

          {recipe.credit && (
            <div className={`${SECTION} pb-8`}>
              <h2 className={HEADING}>Credit</h2>
              <p className="prose prose-sm text-muted">{recipe.credit}</p>
            </div>
          )}
        </div>
        <Link href="/" className="text-xs mt-8 text-muted">
          Back to Home Page
        </Link>
      </main>
    </div>
  )
}
