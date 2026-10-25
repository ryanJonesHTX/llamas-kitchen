import { cache, type ComponentType, type SVGProps } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowTopRightOnSquareIcon, ClockIcon, FireIcon, ScissorsIcon, UsersIcon } from '@heroicons/react/24/outline'
import { auth } from '../../../auth'
import IngredientChecklist from '../../../components/IngredientChecklist'
import { formatMinutes } from '../../../lib/recipes/duration'
import { formatIngredient } from '../../../lib/recipes/format'
import { recipeImageUrl } from '../../../lib/recipes/image'
import { canView } from '../../../lib/recipes/permissions'
import { getRecipeBySlug, type RecipeRecord } from '../../../lib/recipes/queries'
import { isAdmin } from '../../../lib/roles'

const SECTION_HEADING = 'font-display text-2xl font-semibold tracking-tight text-text'

type Props = { params: Promise<{ slug: string }> }

// One database read per request, shared by generateMetadata and the page.
const loadRecipe = cache(getRecipeBySlug)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const recipe = await loadRecipe((await params).slug)
  return recipe && recipe.status !== 'published' ? { robots: { index: false } } : {}
}

export default async function RecipePage({ params }: Props) {
  const { slug } = await params
  const recipe = await loadRecipe(slug)
  const session = await auth()
  if (!recipe || !canView(session, recipe)) notFound()

  const facts = [
    { label: 'Prep', value: formatMinutes(recipe.prepTime), Icon: ScissorsIcon },
    { label: 'Cook', value: formatMinutes(recipe.cookTime), Icon: FireIcon },
    { label: 'Total', value: formatMinutes(recipe.prepTime + recipe.cookTime), Icon: ClockIcon },
    { label: 'Serves', value: String(recipe.servings), Icon: UsersIcon },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="py-10 sm:py-12 print:pt-0 print:pb-8">
        {recipe.status !== 'published' && <StatusBanner recipe={recipe} />}
        {recipe.tags.length > 0 && (
          <ul role="list" aria-label="Tags" className="mb-4 flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-on-primary-soft">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <h1 className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-balance text-text sm:text-5xl">
          {recipe.name}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted">{recipe.description}</p>

        {/* Facts on the left, actions on the right; cook mode (5.5) joins Edit in the actions row. */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:gap-x-10">
            {facts.map(({ label, value, Icon }) => (
              <Fact key={label} label={label} value={value} Icon={Icon} />
            ))}
          </dl>
          {isAdmin(session) && (
            <div className="flex flex-wrap items-center gap-3 print:hidden">
              <Link
                href={`/recipes/${recipe.slug}/edit`}
                className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft"
              >
                Edit
              </Link>
            </div>
          )}
        </div>
      </div>

      {recipe.imagePublicId && (
        <div className="relative aspect-3/2 overflow-hidden rounded-2xl bg-accent-soft sm:aspect-2/1 lg:aspect-3/1 print:hidden">
          <Image
            src={recipeImageUrl(recipe.imagePublicId, 'hero')}
            alt={recipe.name}
            fill
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover"
            preload
          />
        </div>
      )}

      {/* Stacked, ingredients first, below lg and in print; two columns from lg. */}
      <div className="mt-10 grid grid-cols-1 gap-10 sm:mt-12 lg:grid-cols-3 lg:gap-12 print:mt-0 print:block">
        <section
          aria-labelledby="ingredients-heading"
          className="self-start rounded-xl border border-border bg-surface p-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto print:static print:max-h-none print:break-inside-avoid print:overflow-visible print:bg-transparent print:p-0 print:border-0"
        >
          {/* Servings scaling (5.4) goes in this row, beside the servings note. */}
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="ingredients-heading" className={SECTION_HEADING}>
              Ingredients
            </h2>
            <p className="text-sm text-muted">
              for {recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}
            </p>
          </div>
          <IngredientChecklist lines={recipe.ingredients.map(formatIngredient)} labelledBy="ingredients-heading" />
        </section>

        <div className="lg:col-span-2 print:mt-8">
          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className={SECTION_HEADING}>
              Steps
            </h2>
            <ol role="list" aria-labelledby="steps-heading" className="mt-6 max-w-2xl list-none space-y-8">
              {recipe.steps.map((step, index) => (
                <li key={index} className="flex gap-x-4 print:break-inside-avoid">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-on-accent-soft tabular-nums print:bg-transparent print:ring-1 print:ring-border-strong"
                  >
                    {index + 1}
                  </span>
                  <p className="min-w-0 pt-1 text-lg leading-8 text-text">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          {recipe.notes && (
            <section
              aria-labelledby="notes-heading"
              className="mt-12 max-w-2xl rounded-xl bg-accent-soft p-6 text-on-accent-soft print:break-inside-avoid print:bg-transparent print:p-0"
            >
              <h2 id="notes-heading" className="font-display text-xl font-semibold tracking-tight">
                Notes &amp; tips
              </h2>
              <p className="mt-2 leading-7 whitespace-pre-line">{recipe.notes}</p>
            </section>
          )}

          {(recipe.credit || recipe.sourceUrl) && (
            <p className="mt-12 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-6 text-sm text-muted">
              {recipe.credit && <span>Recipe from {recipe.credit}</span>}
              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-x-1 font-semibold text-accent hover:underline"
                >
                  Source
                  <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
                </a>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Only the owner and admins reach a pending or rejected recipe's page.
function StatusBanner({ recipe }: { recipe: RecipeRecord }) {
  return (
    <div className="mb-6 max-w-3xl rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-text">
      {recipe.status === 'pending' ? (
        <p>
          <strong className="font-semibold">Pending review</strong> — only the submitter and admins can see this recipe.
        </p>
      ) : (
        <p>
          <strong className="font-semibold text-danger">Rejected</strong> — {recipe.rejectionReason}
        </p>
      )}
    </div>
  )
}

function Fact({ label, value, Icon }: { label: string; value: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <div>
      <dt className="flex items-center gap-x-1.5 text-sm text-muted">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-text tabular-nums">{value}</dd>
    </div>
  )
}
