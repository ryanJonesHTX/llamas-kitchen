// Server-only: reads CLOUDINARY_CLOUD_NAME. Client components get the URLs (or a prefix) as props.

export type RecipeImageSize = 'thumb' | 'card' | 'hero' | 'og'

const TRANSFORMATIONS: Record<RecipeImageSize, string> = {
  thumb: 'c_fill,g_auto,w_96,h_96',
  card: 'c_fill,g_auto,w_800,h_600',
  hero: 'c_limit,w_1400',
  og: 'c_fill,w_1200,h_630',
}

// Everything in a recipe image URL before the public ID. The recipe form gets
// it as a prop, because it learns public IDs in the browser (from uploads).
export function recipeImageUrlPrefix(size: RecipeImageSize): string {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME is not set')
  return `https://res.cloudinary.com/${cloudName}/image/upload/${TRANSFORMATIONS[size]},f_auto,q_auto/`
}

// The Cloudinary delivery URL for a recipe image at one of the app's sizes.
export function recipeImageUrl(publicId: string, size: RecipeImageSize): string {
  if (!publicId.trim()) throw new Error('recipeImageUrl: blank public ID')
  return `${recipeImageUrlPrefix(size)}${publicId}`
}
