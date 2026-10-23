import mongoose from 'mongoose'
import { z } from 'zod'
import dbConnect from '../../../lib/dbConnect'
import { recipeInputSchema } from '../../../lib/recipeSchema'
import { requireAdmin } from '../../../lib/requireAdmin'
import Recipe from '../../../models/Recipe'

export default async function handler(req, res) {
  const {
    query: { id },
    method,
  } = req

  if (!['GET', 'PUT', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).json({ success: false })
  }

  if (method !== 'GET' && !(await requireAdmin(req, res))) return

  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ success: false })
  }

  await dbConnect()

  switch (method) {
    case 'GET' /* Get a model by its ID */: {
      const recipe = await Recipe.findById(id)
      if (!recipe) {
        return res.status(404).json({ success: false })
      }
      return res.status(200).json({ success: true, data: recipe })
    }

    case 'PUT' /* Replace the editable fields of a model by its ID */: {
      const recipe = await Recipe.findById(id)
      if (!recipe) {
        return res.status(404).json({ success: false })
      }
      const parsed = recipeInputSchema.safeParse(req.body)
      if (!parsed.success) {
        return res
          .status(422)
          .json({ success: false, errors: z.flattenError(parsed.error).fieldErrors })
      }
      // overwrite() keeps _id and the immutable createdAt; save() bumps updatedAt.
      recipe.overwrite(parsed.data)
      await recipe.save()
      return res.status(200).json({ success: true, data: recipe })
    }

    case 'DELETE' /* Delete a model by its ID */: {
      const { deletedCount } = await Recipe.deleteOne({ _id: id })
      if (deletedCount === 0) {
        return res.status(404).json({ success: false })
      }
      return res.status(200).json({ success: true, data: {} })
    }
  }
}
