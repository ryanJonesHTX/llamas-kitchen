import type { RecipeStatus } from '../lib/recipes/model'

// A pending or rejected recipe's status, on its page and on its edit form.
// Only the owner and admins reach either.
export default function RecipeStatusBanner({
  status,
  rejectionReason,
  className = '',
}: {
  status: Exclude<RecipeStatus, 'published'>
  rejectionReason?: string
  className?: string
}) {
  return (
    <div className={`max-w-3xl rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6 text-text ${className}`}>
      {status === 'pending' ? (
        <p>
          <strong className="font-semibold">Pending review</strong> — only the submitter and admins can see this recipe.
        </p>
      ) : (
        <p>
          <strong className="font-semibold text-danger">Rejected</strong> — {rejectionReason}
        </p>
      )}
    </div>
  )
}
