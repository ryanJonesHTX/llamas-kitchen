import { z } from 'zod'
import dbConnect from '../../../lib/dbConnect'
import { recipeInputSchema } from '../../../lib/recipeSchema'
import Recipe from '../../../models/Recipe'

export default async function handler(req, res) {
  const { method } = req

  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ success: false })
  }

  await dbConnect()

  if (method === 'GET') {
    const recipes = await Recipe.find({}) /* find all the data in our database */
    return res.status(200).json({ success: true, data: recipes })
  }

  const parsed = recipeInputSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(422)
      .json({ success: false, errors: z.flattenError(parsed.error).fieldErrors })
  }
  const recipe = await Recipe.create(parsed.data)
  res.status(201).json({ success: true, data: recipe })
}
