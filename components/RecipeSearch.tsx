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
import type { RecipeSearchOption } from '../lib/recipes/queries'

function classNames(...classes: (string | false)[]) {
  return classes.filter(Boolean).join(' ')
}

// Filters the options by name as you type; choosing one opens its href.
export default function RecipeSearch({ options }: { options: RecipeSearchOption[] }) {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const [selected, setSelected] = useState<RecipeSearchOption | null>(null)

  const filtered =
    query === ''
      ? options
      : options.filter((option) =>
          option.name.toLowerCase().includes(query.toLowerCase())
        )

  function choose(option: RecipeSearchOption | null) {
    if (!option) return
    setSelected(option)
    router.push(option.href)
  }

  return (
    <Combobox as="div" value={selected} onChange={choose}>
      <Label className="sr-only">Search Recipes</Label>
      <div className="relative mt-1">
        <ComboboxInput
          className="w-full rounded-md border border-border-strong bg-surface py-2 pl-3 pr-10 text-text shadow-xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary sm:text-sm"
          onChange={(event) => setQuery(event.target.value)}
          displayValue={(option: RecipeSearchOption | null) => option?.name ?? ''}
          placeholder="Search Recipes"
        />
        <ComboboxButton className="absolute text-muted focus-within:text-text inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-hidden">
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        </ComboboxButton>

        {filtered.length > 0 && (
          <ComboboxOptions
            as="ul"
            modal={false}
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-surface py-1 text-base shadow-lg ring-1 ring-border focus:outline-hidden sm:text-sm"
          >
            {filtered.map((option) => (
              <ComboboxOption
                key={option.href}
                as="li"
                value={option}
                className={({ focus }) =>
                  classNames(
                    'relative cursor-pointer select-none py-2 pl-3 pr-9',
                    focus ? 'bg-primary text-on-primary' : 'text-text'
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
                          focus ? 'text-on-primary' : 'text-primary'
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
