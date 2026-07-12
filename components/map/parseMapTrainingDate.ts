import type { PlannedTraining } from '@/types'

/** Parse the various date/time formats stored on PlannedTraining docs. */
export function parseMapTrainingDate(t: PlannedTraining): Date | null {
  const str = t.timeStart
  if (!str) return null
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  if (t.date && /^\d{2}:\d{2}$/.test(str)) return new Date(`${t.date}T${str}`)
  try { return new Date(str) } catch { return null }
}
