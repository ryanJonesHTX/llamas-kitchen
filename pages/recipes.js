import dbConnect from '../lib/dbConnect'
import Recipe from '../models/Recipe'
import Link from 'next/link'
import Head from 'next/head'
import { Fragment, useState, useEffect } from 'react'
import { Disclosure, Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon, FunnelIcon } from '@heroicons/react/20/solid'

const filters = {
  time: [
    { value: '<=80', label: 'Total Time: ~1 Hour' },
    { value: '>80', label: 'Total Time: > 1 Hour' },
  ],
  category: [
    { value: 'Chicken', label: 'Chicken' },
    { value: 'Beef', label: 'Beef' },
    { value: 'Pork', label: 'Pork' },
    { value: 'Seafood', label: 'Seafood' },
    { value: 'Vegetarian', label: 'Vegetarian' },
    { value: 'Pasta', label: 'Pasta' },
    { value: 'Pizza', label: 'Pizza' },
    { value: 'Holiday', label: 'Holiday' },
    { value: 'Sweets', label: 'Sweets' },
    { value: 'Sides', label: 'Sides' },
  ],
}
const sortOptions = [
  { name: 'Newest', value: 'descending', current: true },
  { name: 'Oldest', value: 'ascending', current: false },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function Recipes({ recipes }) {
  const [open, setOpen] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [selectedTimeFilter, setSelectedTimeFilter] = useState(null)
  const [recipeList, setRecipeList] = useState(recipes)
  const [filteredData, setFilteredData] = useState(recipeList)
  const [sortOption, setSortOption] = useState('descending')

  useEffect(() => {
    const filterData = () => {
      let filteredData = [...recipeList]

      if (selectedCategories.length > 0) {
        filteredData = filteredData.filter((item) => {
          return selectedCategories.includes(item.category)
        })
      }

      if (selectedTimeFilter) {
        filteredData = filteredData.filter((item) => {
          if (selectedTimeFilter === '<=80') {
            return item.cookTime + item.prepTime <= 80
          } else if (selectedTimeFilter === '>80') {
            return item.cookTime + item.prepTime > 80
          }
          return true
        })
      }

      setFilteredData(filteredData)
    }
  }, [selectedCategories, selectedTimeFilter, sortOption])

  const handleSort = (value) => {
    sortOptions.forEach((option) => {
      if (option.value === value) {
        option.current = true
      } else {
        option.current = false
      }
    })
    console.log(value)

    setSortOption(value)
  }

  function applyFilterAndSort(
    recipeList,
    filteredData,
    selectedCategories,
    selectedTimeFilter,
    sortOption
  ) {
    let filteredAndSortedData = recipeList

    if (filteredData.length > 0) {
      filteredAndSortedData = filteredData
    }

    if (selectedCategories.length > 0) {
      filteredAndSortedData = filteredAndSortedData.filter((recipe) =>
        selectedCategories.includes(recipe.category)
      )
    }

    if (selectedTimeFilter) {
      filteredAndSortedData = filteredData.filter((item) => {
        if (selectedTimeFilter === '<=80') {
          return item.cookTime + item.prepTime <= 80
        } else if (selectedTimeFilter === '>80') {
          return item.cookTime + item.prepTime > 80
        }
        return true
      })
    }

    if (sortOption === 'ascending') {
      filteredAndSortedData = filteredAndSortedData.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      )
    } else if (sortOption === 'descending') {
      filteredAndSortedData = filteredAndSortedData.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
    }

    return filteredAndSortedData
  }

  const filteredAndSortedData = applyFilterAndSort(
    recipeList,
    filteredData,
    selectedCategories,
    selectedTimeFilter,
    sortOption
  )

  const handleCategoryChange = (category) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== category))
    } else {
      setSelectedCategories([...selectedCategories, category])
    }
  }

  const handleTimeFilterChange = (e) => {
    setSelectedTimeFilter(e.target.value)
  }

  const handleClearFilters = () => {
    setSelectedCategories([])
    setSelectedTimeFilter(null)
    const checkboxes = document.querySelectorAll("input[type='checkbox']")
    const radioButtons = document.querySelectorAll("input[type='radio']")
    checkboxes.forEach((checkbox) => (checkbox.checked = false))
    radioButtons.forEach((radio) => (radio.checked = false))
  }

  let filterCount = !selectedTimeFilter
    ? selectedCategories.length
    : selectedCategories.length + 1

  return (
    <div className="bg-white">
      <Head>
        <title>Llamas Kitchen</title>
      </Head>
      <main className="pb-24">
        <div className="py-16 px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Recipes
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-500"></p>
        </div>

        {/* Filters */}
        <Disclosure
          as="section"
          aria-labelledby="filter-heading"
          className="grid items-center border-t border-b border-gray-200"
        >
          <h2 id="filter-heading" className="sr-only">
            Filters
          </h2>
          <div className="relative col-start-1 row-start-1 py-4">
            <div className="mx-auto flex max-w-7xl space-x-6 divide-x divide-gray-200 px-4 text-sm sm:px-6 lg:px-8">
              <div>
                <Disclosure.Button className="group flex items-center font-medium text-gray-700">
                  <FunnelIcon
                    className="mr-2 h-5 w-5 flex-none text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                  {filterCount} {filterCount === 1 ? 'Filter' : 'Filters'}
                </Disclosure.Button>
              </div>
              <div className="pl-6">
                <button
                  type="button"
                  className="text-gray-500"
                  onClick={handleClearFilters}
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
          <Disclosure.Panel className="border-t border-gray-200 py-10">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 px-4 text-sm sm:px-6 md:gap-x-6 lg:px-8">
              <div className="grid auto-rows-min grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-6">
                <fieldset>
                  <legend className="block font-medium">Ready to eat</legend>
                  <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                    {filters.time.map((option, optionIdx) => (
                      <div
                        key={option.value}
                        className="flex items-center text-base sm:text-sm"
                      >
                        <input
                          id={`time-${optionIdx}`}
                          name="time[]"
                          defaultValue={option.value}
                          type="radio"
                          className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          onChange={handleTimeFilterChange}
                        />
                        <label
                          htmlFor={`time-${optionIdx}`}
                          className="ml-3 min-w-0 flex-1 text-gray-600"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="block font-medium">Category</legend>
                  <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                    {filters.category.map((option, optionIdx) => (
                      <div
                        key={option.value}
                        className="flex items-center text-base sm:text-sm"
                      >
                        <input
                          id={`category-${optionIdx}`}
                          name="category[]"
                          defaultValue={option.value}
                          type="checkbox"
                          className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          onChange={() => handleCategoryChange(option.value)}
                        />
                        <label
                          htmlFor={`category-${optionIdx}`}
                          className="ml-3 min-w-0 flex-1 text-gray-600"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>
          </Disclosure.Panel>
          <div className="col-start-1 row-start-1 py-4">
            <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
              <Menu as="div" className="relative inline-block">
                <div className="flex">
                  <Menu.Button className="group inline-flex justify-center text-sm font-medium text-gray-700 hover:text-gray-900">
                    Sort
                    <ChevronDownIcon
                      className="-mr-1 ml-1 h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
                      aria-hidden="true"
                    />
                  </Menu.Button>
                </div>

                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-10 mt-2 w-40 origin-top-right rounded-md bg-white shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      {sortOptions.map((option) => (
                        <Menu.Item key={option.value}>
                          {({ active }) => (
                            <span
                              onClick={() => handleSort(option.value)}
                              className={classNames(
                                option.current
                                  ? 'font-medium text-gray-900'
                                  : 'text-gray-500',
                                active ? 'bg-gray-100' : '',
                                'block px-4 py-2 text-sm'
                              )}
                            >
                              {option.name}
                            </span>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>
          </div>
        </Disclosure>

        {/* Product grid */}
        <section
          aria-labelledby="recipes-heading"
          className="mx-auto max-w-7xl overflow-hidden sm:px-6 lg:px-8"
        >
          <h2 id="recipes-heading" className="sr-only">
            Recipes
          </h2>

          <div className="-mx-px grid grid-cols-2 border-l border-gray-200 sm:mx-0 md:grid-cols-3 lg:grid-cols-4">
            {filteredAndSortedData.map((recipe) => (
              <div
                key={recipe._id}
                className="group relative border-r border-b border-gray-200 p-4 sm:p-6"
              >
                <div className="aspect-w-1 aspect-h-1 overflow-hidden rounded-lg bg-gray-200 group-hover:opacity-75">
                  <img
                    src={recipe.photo}
                    alt={recipe.name}
                    className="h-full w-full object-cover object-center"
                  />
                </div>
                <div className="pt-8 pb-4 text-center">
                  <h3 className="text-sm font-medium text-gray-900">
                    <Link href="/[id]" as={`/${recipe._id}`}>
                      <span aria-hidden="true" className="absolute inset-0" />
                      {recipe.name}
                    </Link>
                  </h3>
                  <span className="text-gray-500 text-xs">
                    {recipe.cookTime + recipe.prepTime} minutes
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pagination */}
        {/* <nav
          aria-label="Pagination"
          className="mx-auto mt-6 flex max-w-7xl justify-between px-4 text-sm font-medium text-gray-700 sm:px-6 lg:px-8"
        >
          <div className="min-w-0 flex-1">
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              Previous
            </a>
          </div>
          <div className="hidden space-x-2 sm:flex"> */}
        {/* Current: "border-indigo-600 ring-1 ring-indigo-600", Default: "border-gray-300" */}
        {/* <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              1
            </a>
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              2
            </a>
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-indigo-600 bg-white px-4 ring-1 ring-indigo-600 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              3
            </a>
            <span className="inline-flex h-10 items-center px-1.5 text-gray-500">...</span>
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              8
            </a>
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              9
            </a>
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              10
            </a>
          </div>
          <div className="flex min-w-0 flex-1 justify-end">
            <a
              href="#"
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 hover:bg-gray-100 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-25 focus:ring-offset-1 focus:ring-offset-indigo-600"
            >
              Next
            </a>
          </div>
        </nav> */}
      </main>
    </div>
  )
}

export async function getServerSideProps() {
  try {
    await dbConnect()

    /* find all the data in our database */
    const result = await Recipe.find({})
    const recipes = result.map((doc) => {
      const recipe = doc.toObject()
      recipe._id = recipe._id.toString()
      return JSON.parse(JSON.stringify(recipe))
    })

    return { props: { recipes: recipes } }
  } catch (e) {
    console.error(e)
    return { props: {} }
  }
}
