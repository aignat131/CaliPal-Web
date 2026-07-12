/**
 * Shared utilities for parsing and comparing training dates.
 *
 * Training date strings come in several formats:
 *   - Android format: "dd/MM/yyyy HH:mm"
 *   - Time-only with a separate date field: "HH:mm" + fallbackDate "yyyy-MM-dd"
 *   - ISO or other Date-parseable strings
 */

/** Parse a training datetime string into a Date, or null if unparseable. */
export function parseTrainingDateTime(str: string | undefined, fallbackDate?: string): Date | null {
  if (!str) {
    // If no timeStart/timeEnd, try the legacy date field alone
    if (fallbackDate) {
      try { const d = new Date(fallbackDate); return isNaN(d.getTime()) ? null : d } catch { return null }
    }
    return null
  }
  // Android format: "dd/MM/yyyy HH:mm"
  const androidMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (androidMatch) {
    const [, dd, mm, yyyy, hh, min] = androidMatch
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  // Time-only: "HH:mm" with a fallback date
  if (fallbackDate && /^\d{2}:\d{2}$/.test(str)) {
    return new Date(`${fallbackDate}T${str}`)
  }
  // ISO or other parseable format
  try { const d = new Date(str); return isNaN(d.getTime()) ? null : d } catch { return null }
}

interface HasTrainingDates {
  timeStart?: string
  timeEnd?: string
  date?: string
}

/** Compare two trainings by date ascending (earliest first). Undated items sort to the end. */
export function compareTrainingDatesAsc(a: HasTrainingDates, b: HasTrainingDates): number {
  const da = parseTrainingDateTime(a.timeStart, a.date)
  const db = parseTrainingDateTime(b.timeStart, b.date)
  if (!da && !db) return 0
  if (!da) return 1
  if (!db) return -1
  return da.getTime() - db.getTime()
}

/** Compare two trainings by date descending (most recent first). Undated items sort to the end. */
export function compareTrainingDatesDesc(a: HasTrainingDates, b: HasTrainingDates): number {
  return -compareTrainingDatesAsc(a, b)
}

/** Format a training date as a short Romanian locale string (e.g. "lun. 07 iul."). */
export function formatTrainingDate(timeStart: string, legacyDate?: string): string {
  const d = parseTrainingDateTime(timeStart, legacyDate)
  if (!d || isNaN(d.getTime())) return legacyDate ?? ''
  try {
    return d.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return '' }
}

/** Check if a training's end (or start) time is in the past. */
export function isTrainingPast(t: HasTrainingDates): boolean {
  const str = t.timeEnd || t.timeStart
  if (!str) return false
  const end = parseTrainingDateTime(str, t.date)
  return !!end && end < new Date()
}
