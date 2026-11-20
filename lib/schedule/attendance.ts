/**
 * Attendance → leaderboard points. Pure logic shared by the API and tests.
 *
 * Each training stores `attendanceAwards: { [uid]: points }` — exactly what was
 * credited to each member for it. Changing attendance re-computes the target
 * awards and applies only the difference, so marking/unmarking is idempotent
 * and never double-counts.
 */

export interface PlanPoints {
  attendance: number    // per attended session
  goalAchieved: number  // bonus when a goal is marked "atins"
}

export const DEFAULT_POINTS: PlanPoints = { attendance: 10, goalAchieved: 25 }
export const MAX_POINTS = 1000

/** How long after closing staff can still correct attendance. */
export const ATTENDANCE_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000
/** Check-in window relative to the session. */
export const CHECKIN_BEFORE_MS = 15 * 60 * 1000
export const CHECKIN_AFTER_END_MS = 60 * 60 * 1000

export function sanitizePoints(v: unknown): PlanPoints {
  const o = (v ?? {}) as Partial<PlanPoints>
  const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_POINTS
  return {
    attendance: ok(o.attendance) ? o.attendance : DEFAULT_POINTS.attendance,
    goalAchieved: ok(o.goalAchieved) ? o.goalAchieved : DEFAULT_POINTS.goalAchieved,
  }
}

/** Legacy trainings (closed before this feature) credited 10 points to attendees + author. */
export function legacyAwards(attendedBy: string[] | undefined, authorId: string | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const uid of attendedBy ?? []) out[uid] = 10
  if (authorId && (attendedBy?.length ?? 0) > 0) out[authorId] = 10
  return out
}

/**
 * Target awards for a set of attendees. The session author (coach) is credited
 * as well, as the app has always done, but only when at least one person attended.
 */
export function targetAwards(attended: string[], authorId: string | undefined, points: PlanPoints): Record<string, number> {
  const out: Record<string, number> = {}
  for (const uid of attended) out[uid] = points.attendance
  if (authorId && attended.length > 0) out[authorId] = points.attendance
  return out
}

export interface AwardDelta {
  uid: string
  points: number          // to add (may be negative)
  attendedDelta: -1 | 0 | 1  // change in "trainings attended" counters
}

/** Differences to apply when moving from `prev` awards to `next` awards. */
export function diffAwards(prev: Record<string, number>, next: Record<string, number>): AwardDelta[] {
  const uids = new Set([...Object.keys(prev), ...Object.keys(next)])
  const out: AwardDelta[] = []
  for (const uid of uids) {
    const had = uid in prev
    const has = uid in next
    const points = (next[uid] ?? 0) - (prev[uid] ?? 0)
    const attendedDelta = had === has ? 0 : has ? 1 : -1
    if (points !== 0 || attendedDelta !== 0) out.push({ uid, points, attendedDelta })
  }
  return out.sort((a, b) => a.uid.localeCompare(b.uid))
}

export type AttendanceCheck =
  | { ok: true }
  | { ok: false; reason: 'not-started' | 'locked' | 'checkin-closed' }

/** Staff can set attendance once the session started, until 48h after it was first closed. */
export function canEditAttendance(opts: {
  now: number
  startMs: number | null
  closedAtMs: number | null
  isSuperAdmin: boolean
}): AttendanceCheck {
  if (opts.isSuperAdmin) return { ok: true }
  if (opts.startMs !== null && opts.now < opts.startMs) return { ok: false, reason: 'not-started' }
  if (opts.closedAtMs !== null && opts.now - opts.closedAtMs > ATTENDANCE_EDIT_WINDOW_MS) return { ok: false, reason: 'locked' }
  return { ok: true }
}

/** Members can check themselves in from 15 min before start until 1h after the end. */
export function canCheckIn(opts: { now: number; startMs: number | null; endMs: number | null }): AttendanceCheck {
  if (opts.startMs === null) return { ok: false, reason: 'checkin-closed' }
  const end = opts.endMs ?? opts.startMs + 2 * 60 * 60 * 1000
  if (opts.now < opts.startMs - CHECKIN_BEFORE_MS || opts.now > end + CHECKIN_AFTER_END_MS) {
    return { ok: false, reason: 'checkin-closed' }
  }
  return { ok: true }
}
