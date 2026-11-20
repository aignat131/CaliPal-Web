/**
 * Week helpers for the community schedule.
 *
 * A week is identified by the calendar date of its Monday, "yyyy-MM-dd".
 * "Today" is always evaluated in Europe/Bucharest so that a user travelling or
 * a server running in UTC sees the same week as the community.
 * All other arithmetic is pure calendar-date math (UTC-based, no DST issues).
 */

export const SCHEDULE_TIME_ZONE = 'Europe/Bucharest'

export const DAY_NAMES = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'] as const
export const DAY_SHORT = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'] as const

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = KEY_RE.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

function parseKey(key: string): Date {
  const m = KEY_RE.exec(key)
  if (!m) throw new Error(`Invalid date key: ${key}`)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
}

function toKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's calendar date in Europe/Bucharest, "yyyy-MM-dd". */
export function todayKey(now: Date = new Date()): string {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Monday of the week containing `dateKey`. */
export function weekStartOf(dateKey: string): string {
  const d = parseKey(dateKey)
  const dow = (d.getUTCDay() + 6) % 7 // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow)
  return toKey(d)
}

export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayKey(now))
}

export function addDays(dateKey: string, n: number): string {
  const d = parseKey(dateKey)
  d.setUTCDate(d.getUTCDate() + n)
  return toKey(d)
}

export function addWeeks(weekKey: string, n: number): string {
  return addDays(weekKey, n * 7)
}

/** Whole weeks between two week keys (b - a). */
export function weeksBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / (7 * 86_400_000))
}

export interface WeekDay {
  index: number      // 0 = Monday
  dateKey: string    // yyyy-MM-dd
  name: string       // "Luni"
  short: string      // "Lun"
  dayMonth: string   // "23.11"
}

export function weekDays(weekKey: string): WeekDay[] {
  return DAY_NAMES.map((name, i) => {
    const key = addDays(weekKey, i)
    const [, mm, dd] = key.split('-')
    return { index: i, dateKey: key, name, short: DAY_SHORT[i], dayMonth: `${dd}.${mm}` }
  })
}

/** "23.11 – 29.11" */
export function weekRangeLabel(weekKey: string): string {
  const days = weekDays(weekKey)
  return `${days[0].dayMonth} – ${days[6].dayMonth}`
}

/** "acum 5 min", "acum 3 ore", "ieri", "acum 4 zile", "12.10.2026" */
export function relativeTimeRo(ms: number | null | undefined, now: number = Date.now()): string {
  if (!ms) return 'niciodată'
  const s = Math.max(0, Math.floor((now - ms) / 1000))
  if (s < 60) return 'chiar acum'
  if (s < 3600) return `acum ${Math.floor(s / 60)} min`
  if (s < 86_400) { const h = Math.floor(s / 3600); return h === 1 ? 'acum o oră' : `acum ${h} ore` }
  const d = Math.floor(s / 86_400)
  if (d === 1) return 'ieri'
  if (d < 30) return `acum ${d} zile`
  const date = new Date(ms)
  return new Intl.DateTimeFormat('ro-RO', { timeZone: SCHEDULE_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

/** "18:00–19:00" for a 1-hour slot starting at `hour`. */
export function slotLabel(hour: number): string {
  const h = String(hour).padStart(2, '0')
  const e = String((hour + 1) % 24).padStart(2, '0')
  return `${h}:00–${e === '00' ? '24' : e}:00`
}
