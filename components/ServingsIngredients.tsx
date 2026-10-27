'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { MinusIcon, PlusIcon } from '@heroicons/react/20/solid'
import { MAX_SCALED_SERVINGS } from '../lib/constants'
import type { Ingredient } from '../lib/ingredients'
import { scaleIngredientLine } from '../lib/recipes/scale'
import IngredientChecklist from './IngredientChecklist'

const STEP_BUTTON =
  'inline-flex size-11 items-center justify-center rounded-md border border-border-strong bg-surface text-text hover:bg-primary-soft hover:text-on-primary-soft aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-surface aria-disabled:hover:text-text lg:size-8 print:hidden'

// The recipe page's Ingredients header row and checklist, with a servings
// stepper that scales the lines on this page only. At a limit the button is
// aria-disabled, not disabled, which would blur it; its press does nothing.
export default function ServingsIngredients({
  heading,
  headingId,
  ingredients,
  servings,
}: {
  heading: ReactNode
  headingId: string
  ingredients: Ingredient[]
  servings: number
}) {
  const [chosen, setChosen] = useState(servings)
  const increaseRef = useRef<HTMLButtonElement>(null)
  const statusId = useId()
  const max = Math.max(MAX_SCALED_SERVINGS, servings)
  const atMin = chosen <= 1
  const atMax = chosen >= max

  const reset = () => {
    setChosen(servings)
    increaseRef.current?.focus()
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {heading}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p id={statusId} role="status" className="text-sm text-muted">
            for {chosen} {chosen === 1 ? 'serving' : 'servings'}
          </p>
          <div role="group" aria-label="Servings" className="flex items-center gap-x-1">
            <button
              type="button"
              aria-label="Decrease servings"
              aria-describedby={statusId}
              aria-disabled={atMin}
              onClick={() => !atMin && setChosen(chosen - 1)}
              className={STEP_BUTTON}
            >
              <MinusIcon className="size-5" aria-hidden="true" />
            </button>
            <button
              ref={increaseRef}
              type="button"
              aria-label="Increase servings"
              aria-describedby={statusId}
              aria-disabled={atMax}
              onClick={() => !atMax && setChosen(chosen + 1)}
              className={STEP_BUTTON}
            >
              <PlusIcon className="size-5" aria-hidden="true" />
            </button>
          </div>
          {chosen !== servings && (
            <button
              type="button"
              aria-label="Reset servings"
              onClick={reset}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline lg:min-h-0 print:hidden"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <IngredientChecklist
        lines={ingredients.map((ingredient) => scaleIngredientLine(ingredient, chosen / servings))}
        labelledBy={headingId}
      />
    </>
  )
}
