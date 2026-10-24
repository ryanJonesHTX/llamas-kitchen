'use client'

import { useRouter } from 'next/navigation'
import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { CheckIcon, ChevronDownIcon, FunnelIcon } from '@heroicons/react/20/solid'
import { RECIPE_SORT_OPTIONS, TIME_FILTERS } from '../lib/constants'
import type { ListingQuery } from '../lib/recipes/listing'
import { listingHref } from '../lib/recipes/listingHref'

// The filter and sort state the URL holds, minus the page cursor.
type ListingState = Pick<ListingQuery, 'tags' | 'time' | 'sort'>

// Rows are 44px tall on phones; the label fills the row, so all of it is tappable.
const optionClass = 'flex min-h-11 items-center gap-x-3 text-base text-text sm:min-h-0 sm:text-sm'
const labelClass = 'flex min-w-0 flex-1 items-center self-stretch'
const inputClass = 'h-4 w-4 shrink-0 border-border-strong text-primary focus:ring-focus'

// Checked state comes from the URL; every change navigates, which drops the cursor.
export default function RecipeFilters({ state, tagsInUse }: { state: ListingState; tagsInUse: string[] }) {
  const router = useRouter()
  const go = (next: ListingState) => router.push(listingHref(next), { scroll: false })

  const toggleTag = (tag: string) =>
    go({ ...state, tags: state.tags.includes(tag) ? state.tags.filter((t) => t !== tag) : [...state.tags, tag] })

  const filterCount = state.tags.length + (state.time ? 1 : 0)
  // "Clear all" goes to the bare /recipes, so it only shows when that changes something.
  const canClear = listingHref(state) !== '/recipes'
  const sortLabel = RECIPE_SORT_OPTIONS.find((option) => option.value === state.sort)!.label

  return (
    <Disclosure as="section" aria-labelledby="filter-heading" className="border-b border-border pb-4">
      <h2 id="filter-heading" className="sr-only">
        Filters
      </h2>
      <div className="flex items-center gap-x-4 text-sm">
        <DisclosureButton
          aria-label={filterCount > 0 ? `Filters, ${filterCount} active` : undefined}
          className="inline-flex min-h-11 items-center gap-x-2 rounded-md border border-border-strong bg-surface px-3 font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft data-open:bg-primary-soft data-open:text-on-primary-soft"
        >
          <FunnelIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* The space keeps the visible text "Filters 2", not "Filters2", so it reads as part of the name (WCAG 2.5.3). */}
          Filters{' '}
          {filterCount > 0 && (
            <span
              aria-hidden="true"
              className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-semibold text-on-primary tabular-nums"
            >
              {filterCount}
            </span>
          )}
        </DisclosureButton>
        {canClear && (
          <button
            type="button"
            className="min-h-11 font-semibold text-accent hover:underline"
            onClick={() => router.push('/recipes', { scroll: false })}
          >
            Clear all
          </button>
        )}
        <Menu as="div" className="relative ml-auto">
          <MenuButton className="group inline-flex min-h-11 items-center gap-x-1 font-semibold text-muted hover:text-text">
            Sort: <span className="text-text">{sortLabel}</span>
            <ChevronDownIcon className="-mr-1 h-5 w-5 shrink-0 text-muted group-hover:text-text" aria-hidden="true" />
          </MenuButton>
          <MenuItems
            modal={false}
            transition
            className="absolute right-0 z-10 mt-2 w-44 origin-top-right rounded-lg bg-surface p-1 shadow-lg ring-1 ring-border transition focus:outline-hidden data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in motion-reduce:transition-none"
          >
            {RECIPE_SORT_OPTIONS.map((option) => {
              const selected = state.sort === option.value
              return (
                <MenuItem key={option.value}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => go({ ...state, sort: option.value })}
                    className={`flex min-h-11 w-full items-center gap-x-2 rounded-md px-3 py-2 text-left text-sm sm:min-h-0 data-focus:bg-primary-soft data-focus:text-on-primary-soft ${
                      selected ? 'font-semibold text-text' : 'text-muted'
                    }`}
                  >
                    <CheckIcon className={`h-4 w-4 shrink-0 text-primary ${selected ? '' : 'invisible'}`} aria-hidden="true" />
                    {option.label}
                  </button>
                </MenuItem>
              )
            })}
          </MenuItems>
        </Menu>
      </div>
      <DisclosurePanel className="mt-4 grid gap-8 rounded-xl border border-border bg-surface p-6 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <fieldset>
          <legend className="font-semibold text-text">Ready to eat</legend>
          <div className="mt-2 sm:mt-4 sm:space-y-3">
            {TIME_FILTERS.map((option) => (
              <div key={option.value} className={optionClass}>
                <input
                  id={`time-${option.value}`}
                  name="time"
                  value={option.value}
                  type="radio"
                  checked={state.time === option.value}
                  onChange={() => go({ ...state, time: option.value })}
                  className={inputClass}
                />
                <label htmlFor={`time-${option.value}`} className={labelClass}>
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold text-text">Tags</legend>
          <div className="mt-2 grid grid-cols-2 gap-x-6 sm:mt-4 sm:grid-cols-3 sm:gap-y-3">
            {tagsInUse.map((tag, tagIdx) => (
              <div key={tag} className={optionClass}>
                <input
                  id={`tag-${tagIdx}`}
                  name="tag"
                  value={tag}
                  type="checkbox"
                  checked={state.tags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                  className={`${inputClass} rounded-sm`}
                />
                <label htmlFor={`tag-${tagIdx}`} className={`${labelClass} break-words`}>
                  {tag}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      </DisclosurePanel>
    </Disclosure>
  )
}
