// URL slug from a recipe name: "Crème brûlée & Co." -> "creme-brulee-and-co".
// Throws when nothing usable is left (blank, or only emoji or symbols).
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw new Error(`slugify: nothing to slug in ${JSON.stringify(name)}`)
  return slug
}
