import Image from 'next/image'
import Link from 'next/link'
import { CakeIcon, ClockIcon } from '@heroicons/react/24/outline'
import { formatMinutes } from '../lib/recipes/duration'
import type { RecipeCardData } from '../lib/recipes/card'

const MAX_TAGS = 3

// One recipe in a card grid (/recipes and the home page). Renders from plain data, so client components can use it too.
// The title link's overlay span makes the whole card one link, named by the recipe.
export default function RecipeCard({ recipe }: { recipe: RecipeCardData }) {
  const shownTags = recipe.tags.slice(0, MAX_TAGS)
  const hiddenTagCount = recipe.tags.length - shownTags.length

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface motion-safe:transition-shadow hover:border-border-strong hover:shadow-md has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
      <div className="relative aspect-4/3 bg-accent-soft">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CakeIcon className="h-12 w-12 text-muted" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {shownTags.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {shownTags.map((tag) => (
              <li key={tag} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-on-primary-soft">
                {tag}
              </li>
            ))}
            {hiddenTagCount > 0 && (
              <li className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-on-primary-soft">
                +{hiddenTagCount}
                <span className="sr-only"> more {hiddenTagCount === 1 ? 'tag' : 'tags'}</span>
              </li>
            )}
          </ul>
        )}
        <h3 className="line-clamp-2 font-display text-lg leading-snug font-semibold text-text">
          <Link href={`/recipes/${recipe.slug}`} className="focus-visible:outline-none">
            <span aria-hidden="true" className="absolute inset-0" />
            {recipe.name}
          </Link>
        </h3>
        <p className="mt-auto flex items-center gap-x-1.5 pt-3 text-sm text-muted tabular-nums">
          <ClockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">Total time: </span>
          {formatMinutes(recipe.prepTime + recipe.cookTime)}
        </p>
      </div>
    </article>
  )
}
