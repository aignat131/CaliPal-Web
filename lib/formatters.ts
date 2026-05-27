import type { Timestamp } from 'firebase/firestore'

/** Format a duration in seconds to "m:ss" (e.g. 125 → "2:05"). */
export function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Format a Firestore Timestamp (or Timestamp-like object) to a localised date string. */
export function formatDate(
  ts: Timestamp | { toDate: () => Date } | null | undefined,
  locale = 'ro',
): string {
  if (!ts) return ''
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date()
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Format an Android datetime string "dd/MM/yyyy HH:mm" (or ISO) to a short
 * localised label like "lun, 03 ian".
 */
export function formatDateStr(str: string | undefined, locale = 'ro'): string {
  if (!str) return ''
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) {
    const [, dd, mm, yyyy] = m
    try {
      return new Date(`${yyyy}-${mm}-${dd}`).toLocaleDateString(locale, {
        weekday: 'short', day: '2-digit', month: 'short',
      })
    } catch { return str }
  }
  try {
    return new Date(str).toLocaleDateString(locale, {
      weekday: 'short', day: '2-digit', month: 'short',
    })
  } catch { return str }
}

/** Locale-safe "yyyy-MM-dd" from a Date — avoids toDateString() timezone issues. */
export function localDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}
