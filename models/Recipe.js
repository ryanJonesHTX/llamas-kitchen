import mongoose from 'mongoose'
const { Schema } = mongoose;

const RecipeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    directions: {
      type: String,
      required: true,
    },
    ingredients: {
      type: Array,
      required: true,
    },
    prepTime: {
      type: Number,
      require: true,
    },
    cookTime: {
      type: Number,
      require: true,
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
    notes: {
      type: String,
      require: false,
    }
  },
  { timestamps: true }
);

export default mongoose.models.Recipe || mongoose.model('Recipe', RecipeSchema)
