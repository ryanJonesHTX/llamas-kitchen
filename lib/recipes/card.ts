import { recipeImageUrl } from './image'
import type { RecipeCardRecord } from './listing'

// What a RecipeCard renders: plain, serializable data, so cards can render in
// client components. Server-only: recipeImageUrl reads the environment.
export type RecipeCardData = {
  id: string
  name: string
  slug: string
  prepTime: number
  cookTime: number
  tags: string[]
  imageUrl: string | null
}

export function toCardData(record: RecipeCardRecord): RecipeCardData {
  const { _id, name, slug, prepTime, cookTime, tags, imagePublicId } = record
  return {
    id: _id.toHexString(),
    name,
    slug,
    prepTime,
    cookTime,
    tags,
    imageUrl: imagePublicId ? recipeImageUrl(imagePublicId, 'card') : null,
  }
}
