'use client'

import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions, Description, Field } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { MAX_RECIPE_TAG_LENGTH, MAX_RECIPE_TAGS } from '../lib/constants'
import { normalizeTag } from '../lib/recipes/input'
import { splitTags, suggestTags } from '../lib/recipes/tags'

const MAX_SUGGESTIONS = 8

const OPTION =
  'flex min-h-11 cursor-pointer items-center rounded-md px-3 py-2 text-sm break-words text-text select-none data-focus:bg-primary data-focus:text-on-primary'

// The recipe form's tags: chips above a combobox that suggests `tagsInUse`.
// Enter or a comma adds the typed text, and so does leaving the field, so
// nothing typed is lost on submit. Typing opens the suggestions; with nothing
// typed, ArrowDown opens every tag in use. The first option is always the
// typed text (an existing tag, or "Add …"), so Enter adds what was typed
// unless another option was arrowed to.
// `inputRef` and `onBlur` are react-hook-form's. The help and the error are
// Headless UI Descriptions in a Field: the combobox input sets its own
// aria-describedby from them, overriding one passed to it.
export default function TagInput({
  id,
  tags,
  tagsInUse,
  onChange,
  onBlur,
  inputRef,
  inputClassName,
  helpClassName,
  error,
  errorClassName,
}: {
  id: string
  tags: string[]
  tagsInUse: string[]
  onChange: (tags: string[]) => void
  onBlur: () => void
  inputRef: (element: HTMLInputElement | null) => void
  inputClassName: string
  helpClassName: string
  error: string | undefined
  errorClassName: string
}) {
  const [query, setQuery] = useState('')
  // ArrowDown with nothing typed lists every tag in use.
  const [browsing, setBrowsing] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const input = useRef<HTMLInputElement | null>(null)

  const full = tags.length >= MAX_RECIPE_TAGS
  const text = normalizeTag(query)
  const suggestions = full || (!text && !browsing) ? [] : suggestTags(text, tags, tagsInUse, MAX_SUGGESTIONS)
  const offerNew = !full && text !== '' && !tags.includes(text) && !tagsInUse.includes(text)
  const help = full
    ? `${tags.length} of ${MAX_RECIPE_TAGS} tags. Remove a tag to add another.`
    : `Press Enter or type a comma after each tag. ${tags.length} of ${MAX_RECIPE_TAGS} tags.`

  // Adds the new ones of `candidates` (normalized), up to the limit, and
  // announces the outcome. An over-long one (from a paste) is refused.
  function add(candidates: string[]) {
    const added: string[] = []
    const notes: string[] = []
    const tooLong = `Tags can be at most ${MAX_RECIPE_TAG_LENGTH} characters.`
    for (const tag of candidates) {
      if (tag.length > MAX_RECIPE_TAG_LENGTH) {
        if (!notes.includes(tooLong)) notes.push(tooLong)
      } else if (tags.includes(tag) || added.includes(tag)) {
        notes.push(`Tag ${tag} is already added.`)
      } else if (tags.length + added.length >= MAX_RECIPE_TAGS) {
        notes.push(`A recipe can have at most ${MAX_RECIPE_TAGS} tags.`)
        break
      } else {
        added.push(tag)
      }
    }
    if (added.length > 0) {
      onChange([...tags, ...added])
      notes.unshift(`Added ${added.length === 1 ? 'tag' : 'tags'} ${added.join(', ')}.`)
    }
    setAnnouncement(notes.join(' '))
  }

  // Adds every comma-separated tag in `value` and clears the input.
  function commit(value: string) {
    const candidates = splitTags(value)
    setQuery('')
    if (candidates.length > 0) add(candidates)
  }

  function remove(tag: string) {
    onChange(tags.filter((chosen) => chosen !== tag))
    setAnnouncement(`Removed tag ${tag}.`)
    input.current?.focus()
  }

  // A typed comma adds the text before it; the text after it stays. Not while
  // an IME is composing, as with the keys in onKeyDown.
  function type(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setBrowsing(false)
    if (event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing) return setQuery(value)
    const parts = value.split(',')
    const rest = parts.pop() ?? ''
    if (parts.length > 0) add(splitTags(parts.join(',')))
    setQuery(rest)
  }

  // A paste with commas, like "a, b, c", adds every tag in it.
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text')
    if (!pasted.includes(',')) return
    event.preventDefault()
    commit(query + pasted)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, open: boolean, activeIndex: number | null) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'Enter':
        // The combobox adds the highlighted option itself.
        if (open && activeIndex !== null) break
        // The combobox handles Enter only while open; closed, Enter would submit the form.
        if (!open) event.preventDefault()
        commit(query)
        break
      case 'Backspace':
        if (query === '' && tags.length > 0) remove(tags[tags.length - 1])
        break
      case 'ArrowDown':
        if (query === '') setBrowsing(true)
        break
    }
  }

  // The combobox calls this with null when it closes or the input is cleared.
  function pick(tag: string | null) {
    if (tag === null) return
    setQuery('')
    add([tag])
  }

  return (
    <Field>
      <Combobox value={null} onChange={pick}>
        {({ open, activeIndex }) => (
          <>
            {tags.length > 0 && (
              <ul role="list" aria-label="Selected tags" className="mb-2 flex flex-wrap gap-x-2 gap-y-3 lg:gap-y-2">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="inline-flex max-w-full items-center rounded-full bg-primary-soft pl-3 text-sm font-medium text-on-primary-soft lg:pr-0.5"
                  >
                    <span className="min-w-0 py-0.5 break-words">{tag}</span>
                    {/* 44px to tap below lg, overhanging the chip; 24px from lg up. */}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => remove(tag)}
                      className="group -my-2.5 flex size-11 shrink-0 items-center justify-center rounded-full lg:my-0 lg:ml-0.5 lg:size-6"
                    >
                      <span className="flex size-5 items-center justify-center rounded-full group-hover:bg-primary group-hover:text-on-primary">
                        <XMarkIcon className="size-4" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="relative">
              {/* Controlled, so clearing it after an add takes effect while the combobox thinks the user is typing. */}
              <ComboboxInput
                id={id}
                ref={(element: HTMLInputElement | null) => {
                  input.current = element
                  inputRef(element)
                }}
                value={query}
                displayValue={() => query}
                maxLength={MAX_RECIPE_TAG_LENGTH}
                readOnly={full}
                placeholder={full ? undefined : 'Add a tag'}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                className={inputClassName}
                onChange={type}
                onKeyDown={(event) => onKeyDown(event, open, activeIndex)}
                onPaste={paste}
                onBlur={() => {
                  commit(query)
                  onBlur()
                }}
              />
              {(offerNew || suggestions.length > 0) && (
                <ComboboxOptions
                  modal={false}
                  className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
                >
                  {offerNew && (
                    <ComboboxOption value={text} className={OPTION}>
                      <span className="min-w-0">Add “{text}”</span>
                    </ComboboxOption>
                  )}
                  {suggestions.map((tag) => (
                    <ComboboxOption key={tag} value={tag} className={OPTION}>
                      <span className="min-w-0">{tag}</span>
                    </ComboboxOption>
                  ))}
                </ComboboxOptions>
              )}
            </div>
          </>
        )}
      </Combobox>
      <Description id={`${id}-help`} className={helpClassName}>
        {help}
      </Description>
      {error && (
        <Description id={`${id}-error`} className={errorClassName}>
          {error}
        </Description>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </Field>
  )
}
