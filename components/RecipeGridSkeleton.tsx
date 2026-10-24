// Stands in for the filter bar and card grid on /recipes while they load.
// Copies the real sizes (RecipeFilters, RecipeCard) so nothing shifts.
const BLOCK = 'rounded bg-border motion-safe:animate-pulse'

const CARD_COUNT = 8

export default function RecipeGridSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading recipes…</p>
      <div className="flex items-center border-b border-border pb-4">
        <div className={`h-11 w-24 rounded-md ${BLOCK}`} />
        <div className={`ml-auto h-5 w-32 ${BLOCK}`} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: CARD_COUNT }, (_, index) => (
          <div key={index} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div className="aspect-4/3 bg-accent-soft motion-safe:animate-pulse" />
            <div className="flex flex-1 flex-col p-4">
              <div className={`mb-2 h-5 w-16 rounded-full ${BLOCK}`} />
              <div className={`h-6 w-3/4 ${BLOCK}`} />
              <div className="mt-auto pt-3">
                <div className={`h-4 w-20 ${BLOCK}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
