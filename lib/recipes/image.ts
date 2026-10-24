// Server-only: reads CLOUDINARY_CLOUD_NAME. Client components get the URLs as props.

export type RecipeImageSize = 'card' | 'hero' | 'og'

const TRANSFORMATIONS: Record<RecipeImageSize, string> = {
  card: 'c_fill,g_auto,w_800,h_600',
  hero: 'c_limit,w_1400',
  og: 'c_fill,w_1200,h_630',
}

// The Cloudinary delivery URL for a recipe image at one of the app's sizes.
export function recipeImageUrl(publicId: string, size: RecipeImageSize): string {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME is not set')
  if (!publicId.trim()) throw new Error('recipeImageUrl: blank public ID')
  return `https://res.cloudinary.com/${cloudName}/image/upload/${TRANSFORMATIONS[size]},f_auto,q_auto/${publicId}`
}
