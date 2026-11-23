/**
 * Weekly journal. Pure logic.
 *
 * Storage:
 *   communities/{cid}/memberPlans/{uid}/journal/{weekStart}  { trainings, worked, progress, notes }
 */
import { addDays, addWeeks, isDateKey, weekStartOf } from './week'

// ── Journal ──────────────────────────────────────────────────────────────────

export interface JournalEntry {
  week: string
  trainings: number
  worked: string
  progress: string
  notes: string
  saved: boolean
}

/** The last `count` weeks (newest first), each with saved data or an empty pre-generated row. */
export function journalRows(saved: Record<string, Omit<JournalEntry, 'week' | 'saved'>>, currentWeek: string, count = 8): JournalEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const week = addWeeks(currentWeek, -i)
    const s = saved[week]
    return s
      ? { week, ...s, saved: true }
      : { week, trainings: 0, worked: '', progress: '', notes: '', saved: false }
  })
}

/**
 * Suggested number of trainings in a week: distinct days with a logged workout
 * or an attended community session.
 */
export function trainingDaysInWeek(dateKeys: string[], week: string): number {
  const end = addDays(week, 6)
  return new Set(dateKeys.filter(d => isDateKey(d) && d >= week && d <= end && weekStartOf(d) === week)).size
}
