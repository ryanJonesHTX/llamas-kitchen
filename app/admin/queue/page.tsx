import type { Metadata } from 'next'
import Link from 'next/link'
import ReviewControls from '../../../components/ReviewControls'
import { requireAdminPage } from '../../../lib/guards'
import { queueEntries } from '../../../lib/recipes/queries'

export const metadata: Metadata = { title: 'Llamas Kitchen - Review queue' }

const submittedOn = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

// Takes focus after a decision removes the focused item; tabIndex -1 allows it.
const HEADING_ID = 'review-queue-heading'

// Pending recipes, oldest first. Approving or rejecting one re-renders this
// page without it (the actions revalidate it).
export default async function ReviewQueuePage() {
  await requireAdminPage('/admin/queue')
  const entries = await queueEntries()

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6 sm:pt-12 lg:px-8">
      <h1
        id={HEADING_ID}
        tabIndex={-1}
        className="font-display text-4xl font-semibold tracking-tight text-text focus:outline-none sm:text-5xl"
      >
        Review queue
      </h1>
      <p className="mt-2 text-muted">Recipes waiting for review, oldest first.</p>
      {entries.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-base text-muted">Nothing waiting for review.</p>
        </div>
      ) : (
        <ul role="list" className="mt-8 space-y-4">
          {entries.map((entry) => (
            <li key={String(entry._id)} className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="font-display text-xl font-semibold text-text text-balance">
                <Link href={`/recipes/${entry.slug}`} className="inline-flex min-h-11 items-center hover:underline">
                  {entry.name}
                </Link>
              </h2>
              <p className="text-sm text-muted">
                Submitted by {entry.submitter ?? 'a deleted account'} on{' '}
                <time dateTime={entry.createdAt.toISOString()}>{submittedOn.format(entry.createdAt)}</time>
              </p>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-text">{entry.description}</p>
              <ReviewControls
                recipeId={String(entry._id)}
                updatedAt={entry.updatedAt.getTime()}
                name={entry.name}
                focusAfterId={HEADING_ID}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
