/**
 * Weekly journal + periodic progress tests. Pure logic.
 *
 * Storage:
 *   communities/{cid}/memberPlans/{uid}/journal/{weekStart}  { trainings, worked, progress, notes }
 *   communities/{cid}/memberPlans/{uid}/tests/{yyyy-MM-dd}   { values: { [metricId]: number } }
 *   communities/{cid}/config/plan  { testIntervalWeeks, testMetrics: TestMetric[] }
 */
import { addDays, addWeeks, isDateKey, weekStartOf } from './week'

export interface TestMetric {
  id: string
  name: string
  unit: 'rep' | 'sec' | 'kg' | 'cm'
}

export const DEFAULT_TEST_METRICS: TestMetric[] = [
  { id: 'pullups', name: 'Tracțiuni max', unit: 'rep' },
  { id: 'pushups', name: 'Flotări max', unit: 'rep' },
  { id: 'dips', name: 'Dips max', unit: 'rep' },
  { id: 'lsit', name: 'L-sit', unit: 'sec' },
  { id: 'handstand', name: 'Handstand', unit: 'sec' },
]

export const DEFAULT_TEST_INTERVAL_WEEKS = 2
export const MAX_TEST_METRICS = 15
const UNITS = new Set(['rep', 'sec', 'kg', 'cm'])

export interface TestConfig {
  intervalWeeks: number
  metrics: TestMetric[]
}

export function sanitizeTestConfig(v: unknown): TestConfig {
  const o = (v ?? {}) as { testIntervalWeeks?: unknown; testMetrics?: unknown }
  const iw = Number.isInteger(o.testIntervalWeeks) && (o.testIntervalWeeks as number) >= 1 && (o.testIntervalWeeks as number) <= 12
    ? (o.testIntervalWeeks as number) : DEFAULT_TEST_INTERVAL_WEEKS
  let metrics = DEFAULT_TEST_METRICS
  if (Array.isArray(o.testMetrics)) {
    const seen = new Set<string>()
    const clean = o.testMetrics.slice(0, MAX_TEST_METRICS).flatMap(m => {
      const x = (m ?? {}) as Record<string, unknown>
      const id = typeof x.id === 'string' ? x.id.trim().slice(0, 40) : ''
      const name = typeof x.name === 'string' ? x.name.trim().slice(0, 40) : ''
      const unit = typeof x.unit === 'string' && UNITS.has(x.unit) ? (x.unit as TestMetric['unit']) : 'rep'
      if (!id || !name || seen.has(id)) return []
      seen.add(id)
      return [{ id, name, unit }]
    })
    if (clean.length) metrics = clean
  }
  return { intervalWeeks: iw, metrics }
}

/** Slug for a custom metric id. */
export function metricId(name: string): string {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
  return base || 'metric'
}

export interface TestEntry {
  date: string                    // yyyy-MM-dd
  values: Record<string, number>
}

export function sanitizeTestValues(v: unknown, metrics: TestMetric[]): Record<string, number> {
  const ids = new Set(metrics.map(m => m.id))
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    if (!ids.has(k)) continue
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100_000) out[k] = Math.round(n * 10) / 10
  }
  return out
}

/** Is a new test due? Next test = last test + interval weeks. */
export function testStatus(tests: TestEntry[], intervalWeeks: number, today: string) {
  const last = [...tests].map(t => t.date).filter(isDateKey).sort().pop() ?? null
  if (!last) return { last: null, next: today, due: true, overdueDays: 0 }
  const next = addWeeks(last, intervalWeeks)
  const overdueDays = Math.max(0, Math.round((Date.parse(today) - Date.parse(next)) / 86_400_000))
  return { last, next, due: today >= next, overdueDays }
}

/** Time series for one metric, oldest first, skipping tests without that value. */
export function metricSeries(tests: TestEntry[], id: string): { date: string; value: number }[] {
  return tests
    .filter(t => typeof t.values[id] === 'number')
    .map(t => ({ date: t.date, value: t.values[id] }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Change between the first and the latest value of a series. */
export function seriesDelta(series: { value: number }[]): number | null {
  if (series.length < 2) return null
  return Math.round((series[series.length - 1].value - series[0].value) * 10) / 10
}

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
