/**
 * Availability model + heatmap math. Pure functions — shared by the client,
 * the API routes and the unit tests.
 *
 * Storage: one Firestore doc per member at
 *   communities/{cid}/availability/{uid}
 *   {
 *     typical: number[7]                      // recurring schedule
 *     weeks:   { [weekStart]: number[7] }     // per-week overrides
 *     updatedAt: Timestamp
 *   }
 * Each number is a 24-bit mask for one day (index 0 = Monday); bit `h` set means
 * "available from h:00 to h+1:00".
 *
 * A week is "completed" by a member only when an entry exists in `weeks` for it
 * — either a custom override or an explicit "confirm typical schedule".
 * Weeks without an entry still fall back to the typical schedule in the heatmap.
 */

export const DAYS = 7
export const ALL_HOURS_MASK = (1 << 24) - 1
/** Overrides older than this many weeks are pruned on save. */
export const KEEP_PAST_WEEKS = 12

export type WeekMask = number[] // length 7

export interface AvailabilityDoc {
  typical?: WeekMask
  weeks?: Record<string, WeekMask>
  updatedAt?: { toMillis(): number } | null
}

export interface ScheduleConfig {
  startHour: number // inclusive, 0–23
  endHour: number   // exclusive, 1–24
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = { startHour: 10, endHour: 24 }

export function emptyWeek(): WeekMask {
  return [0, 0, 0, 0, 0, 0, 0]
}

/** Coerce untrusted data (Firestore, request bodies) into a valid WeekMask. */
export function sanitizeWeek(v: unknown): WeekMask {
  const out = emptyWeek()
  if (!Array.isArray(v)) return out
  for (let i = 0; i < DAYS; i++) {
    const n = v[i]
    out[i] = typeof n === 'number' && Number.isInteger(n) ? n & ALL_HOURS_MASK : 0
  }
  return out
}

export function sanitizeConfig(v: unknown): ScheduleConfig {
  const o = (v ?? {}) as Partial<ScheduleConfig>
  const s = Number.isInteger(o.startHour) ? (o.startHour as number) : DEFAULT_SCHEDULE_CONFIG.startHour
  const e = Number.isInteger(o.endHour) ? (o.endHour as number) : DEFAULT_SCHEDULE_CONFIG.endHour
  if (s < 0 || s > 23 || e < 1 || e > 24 || e <= s) return { ...DEFAULT_SCHEDULE_CONFIG }
  return { startHour: s, endHour: e }
}

export function configHours(cfg: ScheduleConfig): number[] {
  const out: number[] = []
  for (let h = cfg.startHour; h < cfg.endHour; h++) out.push(h)
  return out
}

export function isWeekEmpty(w: WeekMask): boolean {
  return w.every(n => n === 0)
}

export function hasSlot(w: WeekMask, day: number, hour: number): boolean {
  return ((w[day] >> hour) & 1) === 1
}

export function setSlot(w: WeekMask, day: number, hour: number, on: boolean): WeekMask {
  const next = w.slice()
  next[day] = on ? (next[day] | (1 << hour)) : (next[day] & ~(1 << hour))
  return next
}

export function setSlots(w: WeekMask, cells: { day: number; hour: number }[], on: boolean): WeekMask {
  return cells.reduce((acc, c) => setSlot(acc, c.day, c.hour, on), w)
}

export function weeksEqual(a: WeekMask, b: WeekMask): boolean {
  for (let i = 0; i < DAYS; i++) if ((a[i] | 0) !== (b[i] | 0)) return false
  return true
}

export type WeekSource = 'override' | 'typical' | 'none'

export interface ResolvedWeek {
  mask: WeekMask
  source: WeekSource
  /** True when the member explicitly saved/confirmed this week. */
  completed: boolean
  /** True when the week entry exists and differs from the typical schedule. */
  customized: boolean
}

/** Effective availability of a member for one week. */
export function resolveWeek(doc: AvailabilityDoc | null | undefined, weekKey: string): ResolvedWeek {
  const typical = sanitizeWeek(doc?.typical)
  const raw = doc?.weeks?.[weekKey]
  if (raw !== undefined) {
    const mask = sanitizeWeek(raw)
    return { mask, source: 'override', completed: true, customized: !weeksEqual(mask, typical) }
  }
  if (!isWeekEmpty(typical)) {
    return { mask: typical, source: 'typical', completed: false, customized: false }
  }
  return { mask: emptyWeek(), source: 'none', completed: false, customized: false }
}

/**
 * When the typical schedule changes, weeks (current or future) that were only
 * *confirmed* — i.e. identical to the old typical schedule — follow the change.
 * Customized weeks and past weeks are left untouched.
 * Returns the week entries to rewrite.
 */
export function weeksFollowingTypical(
  doc: AvailabilityDoc | null | undefined,
  newTypical: WeekMask,
  currentWeek: string,
): Record<string, WeekMask> {
  const oldTypical = sanitizeWeek(doc?.typical)
  const out: Record<string, WeekMask> = {}
  for (const [k, raw] of Object.entries(doc?.weeks ?? {})) {
    if (k < currentWeek) continue
    if (weeksEqual(sanitizeWeek(raw), oldTypical)) out[k] = newTypical.slice()
  }
  return out
}

/** Override keys that should be deleted because they are too far in the past. */
export function staleWeekKeys(doc: AvailabilityDoc | null | undefined, currentWeek: string): string[] {
  return Object.keys(doc?.weeks ?? {}).filter(k => k < pruneCutoff(currentWeek))
}

function pruneCutoff(currentWeek: string): string {
  // Lexicographic compare on yyyy-MM-dd is chronological.
  const d = new Date(`${currentWeek}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - KEEP_PAST_WEEKS * 7)
  return d.toISOString().slice(0, 10)
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

export interface MemberWeek {
  uid: string
  mask: WeekMask
}

export interface Heatmap {
  /** counts[day][hour] — hour is the absolute hour 0–23 */
  counts: number[][]
  /** uids[day][hour] */
  uids: string[][][]
  /** Members that have any availability data for the week (denominator for colours). */
  respondents: number
  /** Highest count of any cell within the configured range. */
  max: number
}

/**
 * Build the heatmap from the effective weeks of each member.
 * Members with an empty week are not counted as respondents.
 */
export function computeHeatmap(entries: MemberWeek[], cfg: ScheduleConfig): Heatmap {
  const counts = Array.from({ length: DAYS }, () => new Array<number>(24).fill(0))
  const uids = Array.from({ length: DAYS }, () => Array.from({ length: 24 }, () => [] as string[]))
  let respondents = 0
  let max = 0
  for (const e of entries) {
    if (isWeekEmpty(e.mask)) continue
    respondents++
    for (let d = 0; d < DAYS; d++) {
      for (let h = cfg.startHour; h < cfg.endHour; h++) {
        if (hasSlot(e.mask, d, h)) {
          counts[d][h]++
          uids[d][h].push(e.uid)
          if (counts[d][h] > max) max = counts[d][h]
        }
      }
    }
  }
  return { counts, uids, respondents, max }
}

export interface TopSlot {
  day: number
  hour: number
  count: number
}

/** Best `n` slots by number of available members; ties → earlier day, then earlier hour. */
export function topSlots(counts: number[][], cfg: ScheduleConfig, n = 5): TopSlot[] {
  const all: TopSlot[] = []
  for (let d = 0; d < DAYS; d++) {
    for (let h = cfg.startHour; h < cfg.endHour; h++) {
      const c = counts[d]?.[h] ?? 0
      if (c > 0) all.push({ day: d, hour: h, count: c })
    }
  }
  all.sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour)
  return all.slice(0, n)
}

/** 0..1 intensity of a heatmap cell, relative to the number of respondents. */
export function heatIntensity(count: number, respondents: number): number {
  if (count <= 0 || respondents <= 0) return 0
  return Math.min(1, count / respondents)
}
