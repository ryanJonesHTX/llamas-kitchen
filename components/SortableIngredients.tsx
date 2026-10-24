'use client'

import type { ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bars2Icon, XMarkIcon } from '@heroicons/react/20/solid'

const ICON_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-on-primary-soft'

const SCREEN_READER_INSTRUCTIONS =
  'To pick up an ingredient, press Space or Enter. Use the arrow keys to move it, then press Space or Enter to drop it in its new place, or Escape to cancel.'

// The ingredient rows as a drag-sortable list. `ids` are the rows' stable ids
// (useFieldArray's field.id), in order; `onMove` gets the from and to indexes.
// Pointer events cover mouse and touch; the keyboard sensor makes it sortable without one.
export function SortableIngredients({
  ids,
  onMove,
  labelledBy,
  children,
}: {
  ids: string[]
  onMove: (from: number, to: number) => void
  labelledBy: string
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1
  // dnd-kit's default announcements read out the opaque ids.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ingredient ${position(active.id)}.`,
    // Skips the first "over" (its own place), which would drown out "Picked up".
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `Ingredient ${position(active.id)} moved to position ${position(over.id)}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Ingredient ${position(active.id)} dropped at position ${position(over.id)}.`
        : `Ingredient ${position(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Reordering cancelled. Ingredient ${position(active.id)} is back in place.`,
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    onMove(position(active.id) - 1, position(over.id) - 1)
  }

  return (
    // A fixed id keeps dnd-kit's generated aria ids the same on the server and the client.
    <DndContext
      id="ingredient-reorder"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul role="list" aria-labelledby={labelledBy} className="space-y-2">
          {children}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

// One ingredient row: drag handle, the input (`children`) and a remove button.
// `n` is the row's 1-based position, used in the buttons' names.
export function SortableIngredient({
  id,
  n,
  onRemove,
  children,
}: {
  id: string
  n: number
  onRemove: () => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // The important flag beats dnd-kit's inline transition when motion is reduced.
      className={`relative flex items-center gap-x-2 rounded-lg bg-surface motion-reduce:transition-none! ${
        isDragging ? 'z-10 shadow-md' : ''
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ingredient ${n}`}
        // touch-none stops the page scrolling when a drag starts on a touch screen.
        className={`${ICON_BUTTON} cursor-grab touch-none active:cursor-grabbing`}
      >
        <Bars2Icon className="h-5 w-5" aria-hidden="true" />
      </button>
      {children}
      <button type="button" aria-label={`Remove ingredient ${n}`} className={ICON_BUTTON} onClick={onRemove}>
        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </li>
  )
}
