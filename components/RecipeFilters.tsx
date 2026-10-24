'use client'

import { useRouter } from 'next/navigation'
import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDownIcon, FunnelIcon } from '@heroicons/react/20/solid'
import { RECIPE_SORT_OPTIONS, TIME_FILTERS } from '../lib/constants'
import type { ListingQuery } from '../lib/recipes/listing'
import { listingHref } from '../lib/recipes/listingHref'

// The filter and sort state the URL holds, minus the page cursor.
type ListingState = Pick<ListingQuery, 'tags' | 'time' | 'sort'>

// Checked state comes from the URL; every change navigates, which drops the cursor.
export default function RecipeFilters({ state, tagsInUse }: { state: ListingState; tagsInUse: string[] }) {
  const router = useRouter()
  const go = (next: ListingState) => router.push(listingHref(next), { scroll: false })

  const toggleTag = (tag: string) =>
    go({ ...state, tags: state.tags.includes(tag) ? state.tags.filter((t) => t !== tag) : [...state.tags, tag] })

  const filterCount = state.tags.length + (state.time ? 1 : 0)

  return (
    <Disclosure as="section" aria-labelledby="filter-heading" className="grid items-center border-t border-b border-border">
      <h2 id="filter-heading" className="sr-only">
        Filters
      </h2>
      <div className="relative col-start-1 row-start-1 py-4">
        <div className="mx-auto flex max-w-7xl space-x-6 px-4 text-sm sm:px-6 lg:px-8">
          <div>
            <DisclosureButton className="group flex items-center font-medium text-muted">
              <FunnelIcon className="mr-2 h-5 w-5 flex-none text-muted group-hover:text-text" aria-hidden="true" />
              {filterCount} {filterCount === 1 ? 'Filter' : 'Filters'}
            </DisclosureButton>
          </div>
          <div className="border-l border-border pl-6">
            <button type="button" className="text-muted" onClick={() => router.push('/recipes', { scroll: false })}>
              Clear all
            </button>
          </div>
        </div>
      </div>
      <DisclosurePanel className="border-t border-border py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 px-4 text-sm sm:px-6 md:gap-x-6 lg:px-8">
          <div className="grid auto-rows-min grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-6">
            <fieldset>
              <legend className="block font-medium">Ready to eat</legend>
              <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                {TIME_FILTERS.map((option) => (
                  <div key={option.value} className="flex items-center text-base sm:text-sm">
                    <input
                      id={`time-${option.value}`}
                      name="time"
                      value={option.value}
                      type="radio"
                      checked={state.time === option.value}
                      onChange={() => go({ ...state, time: option.value })}
                      className="h-4 w-4 shrink-0 rounded-sm border-border-strong text-primary focus:ring-focus"
                    />
                    <label htmlFor={`time-${option.value}`} className="ml-3 min-w-0 flex-1 text-muted">
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="block font-medium">Tags</legend>
              <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                {tagsInUse.map((tag, tagIdx) => (
                  <div key={tag} className="flex items-center text-base sm:text-sm">
                    <input
                      id={`tag-${tagIdx}`}
                      name="tag"
                      value={tag}
                      type="checkbox"
                      checked={state.tags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="h-4 w-4 shrink-0 rounded-sm border-border-strong text-primary focus:ring-focus"
                    />
                    <label htmlFor={`tag-${tagIdx}`} className="ml-3 min-w-0 flex-1 text-muted">
                      {tag}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </DisclosurePanel>
      <div className="col-start-1 row-start-1 py-4">
        <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
          <Menu as="div" className="relative inline-block">
            <div className="flex">
              <MenuButton className="group inline-flex justify-center text-sm font-medium text-muted hover:text-text">
                Sort
                <ChevronDownIcon
                  className="-mr-1 ml-1 h-5 w-5 shrink-0 text-muted group-hover:text-text"
                  aria-hidden="true"
                />
              </MenuButton>
            </div>
            <MenuItems
              modal={false}
              transition
              className="absolute right-0 z-10 mt-2 w-40 origin-top-right rounded-md bg-surface py-1 shadow-2xl ring-1 ring-border transition focus:outline-hidden data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
            >
              {RECIPE_SORT_OPTIONS.map((option) => (
                <MenuItem key={option.value}>
                  <button
                    type="button"
                    onClick={() => go({ ...state, sort: option.value })}
                    className={`block w-full px-4 py-2 text-left text-sm data-focus:bg-primary-soft ${
                      state.sort === option.value ? 'font-medium text-text' : 'text-muted'
                    }`}
                  >
                    {option.label}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
        </div>
      </div>
    </Disclosure>
  )
}
