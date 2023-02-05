import mongoose from 'mongoose'

const RecipeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'A recipe has no name?'],
  },
  description: {
    type: String,
    required: [true, "Please provide a brief description of the recipe"],
  },
  directions: {
    type: String,
    required: [true, "Steps please"],
  },
  ingredients: {
    type: Array,
    required: [true, 'There\'s gotta be at least one ingredient! Right?'],
  },
  prepTime: {
    type: Number,
    require: [true, 'Only the number amount please']
  },
  cookTime: {
    type: Number,
    require: [true, 'Only the number amount please']
  },
  photo: {
    type: String,
    require: true,
  },
  cloudinaryId: {
    type: String,
    require: true,
  },
  category: {
    type: String,
    require: true,
  },
  submittedBy: {
    type: String,
    require: false,
  },
})

export default mongoose.models.Recipe || mongoose.model('Recipe', RecipeSchema)