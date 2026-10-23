import dbConnect from '../dbConnect'
import { slugify } from '../slugify'
import { Recipe } from './model'

// slugify(name), then -2, -3, ... while a recipe of any status holds it.
// Two concurrent creates can still pick the same slug; the unique index rejects the second.
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name)
  await dbConnect()
  let slug = base
  for (let n = 2; await Recipe.exists({ slug }); n++) slug = `${base}-${n}`
  return slug
}
