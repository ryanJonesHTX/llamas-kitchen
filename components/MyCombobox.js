import { useState } from 'react'
import Link from 'next/link'
import { CheckIcon, ChevronUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { Combobox } from '@headlessui/react'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function MyCombobox({ recipes }) {
  const [query, setQuery] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState(null)

  const filteredRecipes =
    query === ''
      ? recipes
      : recipes.filter((recipe) => {
          return recipe.name.toLowerCase().includes(query.toLowerCase())
        })

  return (
    <Combobox as="div" value={selectedRecipe} onChange={setSelectedRecipe}>
     
      <div className="relative mt-1">
        <Combobox.Input
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          onChange={(event) => setQuery(event.target.value)}
          displayValue={(recipe) => recipe?.name}
          placeholder="Search Recipes"
        />
        <Combobox.Button className="absolute text-gray-400 focus-within:text-gray-600 inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
          {/* <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" /> */}
          <MagnifyingGlassIcon
                        className="h-5 w-5"
                        aria-hidden="true"
                      />
        </Combobox.Button>

        {filteredRecipes.length > 0 && (
          <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {filteredRecipes.map((recipe) => (
              <Link 
                href={`/${recipe._id}`}
                key={recipe._id}
              >
              <Combobox.Option
                value={recipe}
                className={({ active }) =>
                  classNames(
                    'relative cursor-pointer select-none py-2 pl-3 pr-9',
                    active ? 'bg-indigo-600 text-white' : 'text-gray-900'
                  )
                }
              >
                {({ active, selected }) => (
                  <>
                    <span className={classNames('block truncate', selected && 'font-semibold')}>{recipe.name}</span>

                    {selected && (
                      <span
                        className={classNames(
                          'absolute inset-y-0 right-0 flex items-center pr-4',
                          active ? 'text-white' : 'text-indigo-600'
                        )}
                      >
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Combobox.Option>
              </Link>
            ))}
          </Combobox.Options>
        )}
      </div>
    </Combobox>
  )
}
