'use client'

import { useState } from 'react'

// The recipe page's ingredients as a checklist to tick off while cooking.
// `lines` arrive already formatted; checked state lives in memory only.
// Each label wraps its checkbox, so the whole row toggles and names the box.
export default function IngredientChecklist({ lines, labelledBy }: { lines: string[]; labelledBy: string }) {
  const [checked, setChecked] = useState<boolean[]>(() => lines.map(() => false))
  const toggle = (index: number) => setChecked((current) => current.map((value, i) => (i === index ? !value : value)))

  return (
    <ul role="list" aria-labelledby={labelledBy} className="divide-y divide-border">
      {lines.map((line, index) => (
        <li key={index}>
          <label className="flex min-h-11 cursor-pointer items-start gap-x-3 py-2.5">
            <input
              type="checkbox"
              checked={checked[index]}
              onChange={() => toggle(index)}
              className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-border-strong text-primary print:hidden"
            />
            <span
              className={`min-w-0 break-words ${
                checked[index] ? 'text-muted line-through print:text-text print:no-underline' : 'text-text'
              }`}
            >
              {line}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
