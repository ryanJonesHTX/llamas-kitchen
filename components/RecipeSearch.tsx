'use client'

import { useState } from 'react'
// next/navigation's router also works in Pages Router pages: Next mounts an
// adapter over the Pages router for it.
import { useRouter } from 'next/navigation'
import { CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from '@headlessui/react'
import type { SearchOption } from '../lib/searchOptions'

function classNames(...classes: (string | false)[]) {
  return classes.filter(Boolean).join(' ')
}

// Filters the options by name as you type; choosing one opens its href.
export default function RecipeSearch({ options }: { options: SearchOption[] }) {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const [selected, setSelected] = useState<SearchOption | null>(null)

  const filtered =
    query === ''
      ? options
      : options.filter((option) =>
          option.name.toLowerCase().includes(query.toLowerCase())
        )

  function choose(option: SearchOption | null) {
    if (!option) return
    setSelected(option)
    router.push(option.href)
  }

  return (
    <Combobox as="div" value={selected} onChange={choose}>
      <Label className="sr-only">Search Recipes</Label>
      <div className="relative mt-1">
        <ComboboxInput
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 shadow-xs focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          onChange={(event) => setQuery(event.target.value)}
          displayValue={(option: SearchOption | null) => option?.name ?? ''}
          placeholder="Search Recipes"
        />
        <ComboboxButton className="absolute text-gray-400 focus-within:text-gray-600 inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-hidden">
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </ComboboxButton>

        {filtered.length > 0 && (
          <ComboboxOptions
            as="ul"
            modal={false}
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-hidden sm:text-sm"
          >
            {filtered.map((option) => (
              <ComboboxOption
                key={option.href}
                as="li"
                value={option}
                className={({ focus }) =>
                  classNames(
                    'relative cursor-pointer select-none py-2 pl-3 pr-9',
                    focus ? 'bg-indigo-600 text-white' : 'text-gray-900'
                  )
                }
              >
                {({ focus, selected }) => (
                  <>
                    <span className={classNames('block truncate', selected && 'font-semibold')}>
                      {option.name}
                    </span>

                    {selected && (
                      <span
                        className={classNames(
                          'absolute inset-y-0 right-0 flex items-center pr-4',
                          focus ? 'text-white' : 'text-indigo-600'
                        )}
                      >
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        )}
      </div>
    </Combobox>
  )
}
