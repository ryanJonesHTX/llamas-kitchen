import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserPage } from '../../lib/guards'
import type { RecipeStatus } from '../../lib/recipes/model'
import { canEdit } from '../../lib/recipes/permissions'
import { submittedRecipes } from '../../lib/recipes/queries'

export const metadata: Metadata = { title: 'My recipes', robots: { index: false } }

const submittedOn = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

const BADGE = 'rounded-full px-2 py-0.5 text-xs font-semibold'

const STATUS_BADGES: Record<RecipeStatus, { label: string; className: string }> = {
  published: { label: 'Published', className: `${BADGE} bg-primary-soft text-on-primary-soft` },
  pending: { label: 'Pending review', className: `${BADGE} border border-border-strong text-text` },
  rejected: { label: 'Rejected', className: `${BADGE} border border-border-strong text-danger` },
}

// The signed-in user's recipes of any status, newest first.
export default async function MyRecipesPage() {
  const session = await requireUserPage('/my-recipes')
  const recipes = await submittedRecipes(session.user.id)

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6 sm:pt-12 lg:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">My recipes</h1>
      <p className="mt-2 text-muted">Everything you've added, newest first.</p>
      {recipes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-base text-muted">You haven't added any recipes yet.</p>
          <Link
            href="/new"
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
          >
            Add a recipe
          </Link>
        </div>
      ) : (
        <ul role="list" className="mt-8 space-y-4">
          {recipes.map((recipe) => {
            const badge = STATUS_BADGES[recipe.status]
            return (
              <li key={recipe.slug} className="rounded-xl border border-border bg-surface p-4 sm:p-6">
                <h2 className="font-display text-xl font-semibold text-text text-balance">
                  <Link href={`/recipes/${recipe.slug}`} className="inline-flex min-h-11 items-center hover:underline">
                    {recipe.name}
                  </Link>
                </h2>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className={badge.className}>{badge.label}</span>
                  <span>
                    Added on{' '}
                    <time dateTime={recipe.createdAt.toISOString()}>{submittedOn.format(recipe.createdAt)}</time>
                  </span>
                </p>
                {recipe.status === 'rejected' && (
                  <p className="mt-3 text-sm leading-6 text-text">
                    <strong className="font-semibold">Reason:</strong> {recipe.rejectionReason}
                  </p>
                )}
                {canEdit(session, recipe) && (
                  <Link
                    href={`/recipes/${recipe.slug}/edit`}
                    aria-label={`Edit ${recipe.name}`}
                    className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft"
                  >
                    Edit
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
