// Input colors and focus rings come from the forms-plugin overrides in styles/globals.css.
export const LABEL = 'block text-sm font-medium text-text'
export const INPUT = 'block min-h-11 w-full min-w-0 rounded-lg shadow-xs sm:text-sm'
export const HELP = 'mt-2 text-sm text-muted'
export const ERROR = 'mt-2 text-sm text-danger'
export const CARD = 'rounded-xl border border-border bg-surface p-6'
export const CARD_HEADING = 'font-display text-xl text-text text-balance'
export const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center gap-x-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-primary-soft hover:text-on-primary-soft'

// Marks an input invalid and points it at its error message.
export function errorProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
}
