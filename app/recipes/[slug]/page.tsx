import { cache, type ComponentType, type SVGProps } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowTopRightOnSquareIcon, ClockIcon, FireIcon, ScissorsIcon, UsersIcon } from '@heroicons/react/24/outline'
import { auth } from '../../../auth'
import CookMode, { CookModeToggle } from '../../../components/CookMode'
import RecipeStatusBanner from '../../../components/RecipeStatusBanner'
import ServingsIngredients from '../../../components/ServingsIngredients'
import StepChecklist from '../../../components/StepChecklist'
import { formatMinutes } from '../../../lib/recipes/duration'
import { recipeImageUrl } from '../../../lib/recipes/image'
import { listingHref } from '../../../lib/recipes/listingHref'
import { canEdit, canView } from '../../../lib/recipes/permissions'
import { getRecipeBySlug } from '../../../lib/recipes/queries'

const SECTION_HEADING = 'font-display text-2xl font-semibold tracking-tight text-text'

type Props = { params: Promise<{ slug: string }> }

// One database read per request, shared by generateMetadata and the page.
const loadRecipe = cache(getRecipeBySlug)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Only for a viewer who may see it, so a hidden recipe's 404 matches a missing
  // slug's. The session is read either way, so both stream in the same order.
  const [recipe, session] = await Promise.all([loadRecipe((await params).slug), auth()])
  return recipe && recipe.status !== 'published' && canView(session, recipe) ? { robots: { index: false } } : {}
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

  // Cook mode restyles the page through group-data-cook-mode/cook variants; not-print
  // keeps them off paper, so a printout is the same either way.
  return (
    <CookMode className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="py-10 sm:py-12 print:pt-0 print:pb-8">
        {recipe.status !== 'published' && (
          <RecipeStatusBanner status={recipe.status} rejectionReason={recipe.rejectionReason} className="mb-6" />
        )}
        {/* Each tag links to the list filtered by it. Below lg, an ::after overlay makes
            the 20px chip a 44px target; gap-y-6 keeps stacked rows' targets apart. */}
        {recipe.tags.length > 0 && (
          <ul role="list" aria-label="Tags" className="mb-4 flex flex-wrap gap-x-1.5 gap-y-6 lg:gap-y-1.5 print:gap-x-3 not-print:group-data-cook-mode/cook:hidden">
            {recipe.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={listingHref({ tags: [tag], time: undefined, sort: 'newest', q: undefined })}
                  className="relative block rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-on-primary-soft after:absolute after:inset-x-0 after:-inset-y-3 hover:underline lg:after:hidden print:bg-transparent print:px-0 print:text-text print:no-underline"
                >
                  <span className="sr-only">Recipes tagged </span>
                  <span>{tag}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <h1 className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-balance text-text sm:text-5xl">
          {recipe.name}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted">{recipe.description}</p>

        {/* Facts on the left, actions on the right. */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:gap-x-10">
            {facts.map(({ label, value, Icon }) => (
              <Fact key={label} label={label} value={value} Icon={Icon} />
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {canEdit(session, recipe) && (
              <Link
                href={`/recipes/${recipe.slug}/edit`}
                className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft"
              >
                Edit
              </Link>
            )}
            <CookModeToggle />
          </div>
        </div>
      </div>

      {recipe.imagePublicId && (
        <div className="relative aspect-3/2 overflow-hidden rounded-2xl bg-accent-soft sm:aspect-2/1 lg:aspect-3/1 print:hidden group-data-cook-mode/cook:hidden">
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
          <ServingsIngredients
            heading={
              <h2 id="ingredients-heading" className={SECTION_HEADING}>
                Ingredients
              </h2>
            }
            headingId="ingredients-heading"
            ingredients={recipe.ingredients.map(({ quantity, unit, item }) => ({ quantity, unit, item }))}
            servings={recipe.servings}
          />
        </section>

        <div className="lg:col-span-2 print:mt-8">
          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className={SECTION_HEADING}>
              Steps
            </h2>
            <StepChecklist steps={recipe.steps} labelledBy="steps-heading" />
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
    </CookMode>
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
