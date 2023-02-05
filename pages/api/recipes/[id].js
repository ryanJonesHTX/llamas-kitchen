import dbConnect from '../../../lib/dbConnect'
import Recipe from '../../../models/Recipe'

export default async function handler(req, res) {
  const {
    query: { id },
    method,
  } = req

  await dbConnect()

  switch (method) {
    case 'GET' /* Get a model by its ID */:
      try {
        const recipe = await Recipe.findById(id)
        if (!recipe) {
          return res.status(400).json({ success: false })
        }
        res.status(200).json({ success: true, data: recipe })
      } catch (error) {
        res.status(400).json({ success: false })
      }
      break

    case 'PUT' /* Edit a model by its ID */:
      try {
        const recipe = await Recipe.findByIdAndUpdate(id, req.body, {
          new: true,
          runValidators: true,
        })
        if (!recipe) {
          return res.status(400).json({ success: false })
        }
        res.status(200).json({ success: true, data: recipe })
      } catch (error) {
        res.status(400).json({ success: false })
      }
      break

    case 'DELETE' /* Delete a model by its ID */:
      try {
        const deletedRecipe = await Recipe.deleteOne({ _id: id })
        if (!deletedRecipe) {
          return res.status(400).json({ success: false })
        }
        res.status(200).json({ success: true, data: {} })
      } catch (error) {
        res.status(400).json({ success: false })
      }
      break

    default:
      res.status(400).json({ success: false })
      break
  }
}
