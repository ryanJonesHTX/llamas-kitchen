'use client'

import { useId, useState } from 'react'
import { useCookMode } from './CookMode'

// The recipe page's numbered steps. In cook mode each row becomes a checklist
// item to tick off while cooking: a label wraps the whole row, and the checkbox
// is named "Step N" and described by the step's text. Ticks live in memory and
// are kept, but not shown, while cook mode is off. The server renders cook mode off.
export default function StepChecklist({ steps, labelledBy }: { steps: string[]; labelledBy: string }) {
  const { on: cookMode } = useCookMode()
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => false))
  const toggle = (index: number) => setChecked((current) => current.map((value, i) => (i === index ? !value : value)))
  const textId = useId()

  return (
    <ol role="list" aria-labelledby={labelledBy} className="mt-6 max-w-2xl list-none space-y-8 not-print:group-data-cook-mode/cook:space-y-10">
      {steps.map((step, index) => {
        const struck = cookMode && checked[index]
        const row = (
          <>
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-on-accent-soft tabular-nums print:bg-transparent print:ring-1 print:ring-border-strong"
            >
              {index + 1}
            </span>
            <p
              id={cookMode ? `${textId}-${index}` : undefined}
              className={`min-w-0 whitespace-pre-line pt-1 text-lg leading-8 not-print:group-data-cook-mode/cook:text-2xl not-print:group-data-cook-mode/cook:leading-10 ${
                struck ? 'text-muted line-through print:text-text print:no-underline' : 'text-text'
              }`}
            >
              {step}
            </p>
          </>
        )

        return (
          <li key={index} className="flex gap-x-4 print:break-inside-avoid">
            {cookMode ? (
              <label className="flex min-w-0 flex-1 cursor-pointer gap-x-4">
                <input
                  type="checkbox"
                  aria-label={`Step ${index + 1}`}
                  aria-describedby={`${textId}-${index}`}
                  checked={checked[index]}
                  onChange={() => toggle(index)}
                  className="mt-1 size-7 shrink-0 cursor-pointer rounded border-border-strong text-primary print:hidden"
                />
                {row}
              </label>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ol>
  )
}
