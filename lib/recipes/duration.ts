// 95 -> "1 hr 35 min". Recipe times are whole, non-negative minutes (see model.ts).
export function formatMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error(`formatMinutes: expected a non-negative whole number of minutes, got ${minutes}`)
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}
