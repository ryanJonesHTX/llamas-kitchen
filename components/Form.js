import { useState } from 'react'
import { useRouter } from 'next/router'
import { mutate } from 'swr'
import { CheckCircleIcon } from '@heroicons/react/20/solid'

let nextId = 0

const Form = ({ formId, recipeForm, forNewRecipe = true }) => {
  const router = useRouter()
  const contentType = 'application/json'
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [ingredients, setIngredients] = useState([])
  const [ingredient, setIngredient] = useState('')
  const [uploaded, setUploaded] = useState(false)

  const [form, setForm] = useState({
    name: recipeForm.name,
    description: recipeForm.description,
    directions: recipeForm.directions,
    ingredients: ingredients,
    prepTime: recipeForm.prepTime,
    cookTime: recipeForm.cookTime,
    photo: recipeForm.photo,
    cloudinaryId: recipeForm.cloudinaryId,
    category: recipeForm.category,
    submittedBy: recipeForm.submittedBy,
  })

  console.log(form)

  /* The PUT method edits an existing entry in the mongodb database. */
  const putData = async (form) => {
    const { id } = router.query

    try {
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PUT',
        headers: {
          Accept: contentType,
          'Content-Type': contentType,
        },
        body: JSON.stringify(form),
      })

      // Throw error with status code in case Fetch API req failed
      if (!res.ok) {
        throw new Error(res.status)
      }

      const { data } = await res.json()

      mutate(`/api/recipes/${id}`, data, false) // Update the local data without a revalidation
      router.push('/')
    } catch (error) {
      setMessage('Failed to update recipe')
    }
  }

  /* The POST method adds a new entry in the mongodb database. */
  const postData = async (form) => {
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          Accept: contentType,
          'Content-Type': contentType,
        },
        body: JSON.stringify(form),
      })

      // Throw error with status code in case Fetch API req failed
      if (!res.ok) {
        throw new Error(res.status)
      }

      router.push('/')
    } catch (error) {
      setMessage('Failed to add recipe')
    }
  }

  const handleChange = (e) => {
    const target = e.target
    const value = target.value
    const name = target.name

    setForm({
      ...form,
      [name]: value,
    })
  }

  /* Makes sure pet info is filled for pet name, owner name, species, and image url*/
  const formValidate = () => {
    let err = {}
    if (!form.name) err.name = 'A recipe has no name?'
    if (!form.description)
      err.description = 'Please provide a brief description of the recipe'
    if (!form.ingredients)
      err.ingredients = "There's gotta be at least one ingredient! Right?"
    return err
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = formValidate()
    if (Object.keys(errs).length === 0) {
      forNewRecipe ? postData(form) : putData(form)
    } else {
      setErrors({ errs })
    }
  }

  const handleIngChange = (e) => {
    setIngredient(e.target.value)
  }

  const handleAdd = () => {
    setIngredient('')
    ingredients.push({
      id: nextId++,
      ingredient: ingredient,
    })
  }

  // File uploader
  const handleUploadInput = async (e) => {
    const files = [...e.target.files]
    const formData = new FormData()

    for (let file of files) {
      formData.append('file', file)
    }

    formData.append('upload_preset', 'recipe-images')

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/dhcbfbegu/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    )
    const data = await res.json()

    setForm({ ...form, photo: data.secure_url, cloudinaryId: data.public_id })
    setUploaded(true)
  }

  return (
    <div className="overflow-hidden bg-white py-16 px-6 lg:px-8 lg:py-24">
      <div className="relative mx-auto max-w-4xl">
        <form
          className="space-y-8 divide-y divide-gray-200"
          id={formId}
          onSubmit={handleSubmit}
        >
          <div className="space-y-8 divide-y divide-gray-200">
            <div>
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  New Recipe
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Please fill out the form to add a new recipe.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-6">
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Recipe Name
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="name"
                      id="name"
                      value={form.name}
                      onChange={handleChange}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
                <div className="sm:col-span-6">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Description
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="description"
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      rows={3}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Write a brief description of the recipe
                  </p>
                </div>

                <div className="sm:col-span-6">
                  <label
                    htmlFor="ingredients"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Ingredients
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="ingredients"
                      id="ingredients"
                      value={ingredient}
                      onChange={handleIngChange}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Add Ingredient
                </button>

                <ul
                  role="list"
                  className="col-span-1 sm:col-start-1 sm:col-span-3"
                >
                  {ingredients.map((ingredient) => (
                    <li
                      key={ingredient.id}
                      className="sm:col-span-3 space-x-6 py-1"
                    >
                      <div className="">
                        <div className="flex justify-between align-center relative rounded-full py-1 px-3 text-sm leading-6 text-gray-500 ring-1 ring-gray-900/10 hover:ring-gray-900/20">
                          {ingredient.ingredient}
                          <span
                            className="font-semibold text-indigo-600 mx-1 cursor-pointer"
                            aria-hidden="true"
                            onClick={() => {
                              setIngredients(
                                ingredients.filter(
                                  (a) => a.id !== ingredient.id
                                )
                              )
                            }}
                          >
                            &#x2715;
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="sm:col-span-6">
                  <label
                    htmlFor="directions"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Directions
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="directions"
                      name="directions"
                      value={form.directions}
                      onChange={handleChange}
                      rows={3}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="sm:col-start-1 sm:col-span-1">
                  <label
                    htmlFor="prepTime"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Prep Time
                  </label>
                  <div className="mt-1">
                    <input
                      type="number"
                      name="prepTime"
                      id="prepTime"
                      value={form.prepTime}
                      onChange={handleChange}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
                <div className="col-span-1">
                  <label
                    htmlFor="cookTime"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Cook Time
                  </label>
                  <div className="mt-1">
                    <input
                      type="number"
                      name="cookTime"
                      id="cookTime"
                      value={form.cookTime}
                      onChange={handleChange}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="sm:col-start-1 sm:col-span-2">
                  <label
                    htmlFor="category"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Category
                  </label>
                  <div className="mt-1">
                    <select
                      id="category"
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option>Select a Category</option>
                      <option>Chicken</option>
                      <option>Beef</option>
                      <option>Pork</option>
                      <option>Seafood</option>
                      <option>Pasta</option>
                      <option>Vegetarian</option>
                      <option>Dessert</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
                {!uploaded ? (
                  <div className="sm:col-span-6">
                    <label
                      htmlFor="photo"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Photo
                    </label>
                    <div className="mt-1 flex justify-start rounded-md border border-gray-300 pl-3 py-2">
                      <div className="">
                        <div className="flex text-sm text-gray-600">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer rounded-md bg-white font-medium text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:text-indigo-500"
                          >
                            <span>Upload an image</span>
                            <input
                              id="file-upload"
                              name="photo"
                              type="file"
                              accept="image/*"
                              onChange={handleUploadInput}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sm:col-span-6 rounded-md bg-green-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <CheckCircleIcon
                          className="h-5 w-5 text-green-400"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-800">
                          Image uploaded!
                        </p>
                      </div>
                      <div className="ml-auto pl-3">
                        <div className="-mx-1.5 -my-1.5"></div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="sm:col-span-6">
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Submitted By
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="submittedBy"
                      id="submittedBy"
                      placeholder="Bobby Flay"
                      value={form.submittedBy}
                      onChange={handleChange}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5">
            <div className="flex justify-end">
              <button
                type="submit"
                className="ml-3 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Submit
              </button>
            </div>
          </div>
        </form>
        <p>{message}</p>
        <div>
          {Object.keys(errors).map((err, index) => (
            <li key={index}>{err}</li>
          ))}
        </div>
      </div>
    </div>
  )
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default Form
