import Image from 'next/image'
import Link from 'next/link'
import { recipeImageUrl } from '../lib/recipes/image'
import type { RecipeCardRecord } from '../lib/recipes/listing'

// One cell of the /recipes grid. Server-only: recipeImageUrl reads the environment.
export default function RecipeCard({ recipe }: { recipe: RecipeCardRecord }) {
  return (
    <div className="group relative border-r border-b border-border p-4 sm:p-6">
      <div className="aspect-square overflow-hidden rounded-lg bg-border group-hover:opacity-75">
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
      <div className="pt-8 pb-4 text-center">
        <h3 className="font-display text-sm font-medium text-text">
          <Link href={`/recipes/${recipe.slug}`}>
            <span aria-hidden="true" className="absolute inset-0" />
            {recipe.name}
          </Link>
        </h3>
        <span className="text-muted text-xs">{recipe.cookTime + recipe.prepTime} minutes</span>
      </div>
    </div>
  )
}
