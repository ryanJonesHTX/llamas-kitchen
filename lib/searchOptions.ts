import dbConnect from './dbConnect'
import Recipe from '../models/Recipe'

export type SearchOption = { name: string; href: string }

// Options for the header's recipe search. The current model has no status,
// so every recipe is published.
export async function publishedSearchOptions(): Promise<SearchOption[]> {
  await dbConnect()
  const recipes = await Recipe.find({}, { name: 1 }).lean()
  return recipes.map((recipe) => ({
    name: recipe.name,
    href: `/${recipe._id}`,
  }))
}
