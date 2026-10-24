// Lowercase a-z0-9 words joined by hyphens; '' when nothing usable is left.
function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// URL slug from a recipe name: "Crème brûlée & Co." -> "creme-brulee-and-co".
// Throws when nothing usable is left (blank, or only emoji or symbols).
export function slugify(name: string): string {
  const slug = slugOf(name)
  if (!slug) throw new Error(`slugify: nothing to slug in ${JSON.stringify(name)}`)
  return slug
}

// Whether slugify accepts the name.
export function canSlugify(name: string): boolean {
  return slugOf(name) !== ''
}

// What slugify produces: lowercase a-z0-9 words joined by single hyphens.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
