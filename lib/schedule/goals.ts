/**
 * Goals (target skills), coach-assigned extra exercises and attendance stats
 * for the member file. Pure logic — shared by API, UI and tests.
 *
 * Storage (per community, per member):
 *   communities/{cid}/memberPlans/{uid}/goals/{goalId}
 *   communities/{cid}/memberPlans/{uid}/extraExercises/{exerciseId}
 */
import { addWeeks } from './week'

export const GOAL_SKILLS = [
  'Muscle-up', 'Front lever', 'Back lever', 'Planche', 'Handstand', 'Handstand push-up',
  'Human flag', 'L-sit', 'V-sit', 'Pistol squat', 'Dragon flag', 'One arm pull-up',
] as const

export type GoalStatus = 'IN_PROGRESS' | 'ACHIEVED'

export interface Goal {
  id: string
  skill: string
  currentLevel: string
  target: string
  deadline: string | null   // yyyy-MM-dd
  status: GoalStatus
  rewarded?: boolean
  createdAtMs: number | null
  achievedAtMs: number | null
}

export type ExerciseUnit = 'reps' | 'sec'

export interface ExtraExercise {
  id: string
  name: string
  sets: number
  amount: number            // reps or seconds per set
  unit: ExerciseUnit
  perWeek: number           // how many times a week
  deficiency: string        // what weakness it covers
  notes: string
  assignedByName: string
  active: boolean
  checks: Record<string, number>  // weekKey → times done
  createdAtMs: number | null
}

export function formatPrescription(e: Pick<ExtraExercise, 'sets' | 'amount' | 'unit' | 'perWeek'>): string {
  return `${e.sets} × ${e.amount}${e.unit === 'sec' ? ' sec' : ' rep'} · ${e.perWeek}×/săpt.`
}

// ── Goal reward anti-abuse ───────────────────────────────────────────────────

/** A goal must exist for this long before achieving it earns points. */
export const GOAL_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** At most this many rewarded goals per member in a rolling 30 days. */
export const GOAL_REWARDS_PER_30_DAYS = 2

export type RewardDecision = { reward: true } | { reward: false; reason: 'already-rewarded' | 'too-new' | 'limit' }

export function goalRewardDecision(opts: {
  now: number
  goalCreatedAtMs: number | null
  alreadyRewarded: boolean
  recentRewardTimesMs: number[]  // achievedAt of other rewarded goals
}): RewardDecision {
  if (opts.alreadyRewarded) return { reward: false, reason: 'already-rewarded' }
  if (opts.goalCreatedAtMs === null || opts.now - opts.goalCreatedAtMs < GOAL_MIN_AGE_MS) {
    return { reward: false, reason: 'too-new' }
  }
  const windowStart = opts.now - 30 * 24 * 60 * 60 * 1000
  const recent = opts.recentRewardTimesMs.filter(t => t >= windowStart).length
  if (recent >= GOAL_REWARDS_PER_30_DAYS) return { reward: false, reason: 'limit' }
  return { reward: true }
}

// ── Extra exercises ──────────────────────────────────────────────────────────

/** Share of prescribed sessions done over the last `weeks` weeks (including `currentWeek`). */
export function exerciseCompletion(e: Pick<ExtraExercise, 'perWeek' | 'checks'>, currentWeek: string, weeks = 4) {
  let done = 0
  for (let i = 0; i < weeks; i++) {
    const k = addWeeks(currentWeek, -i)
    done += Math.min(e.checks[k] ?? 0, e.perWeek)
  }
  const expected = e.perWeek * weeks
  return { done, expected, ratio: expected > 0 ? done / expected : 0 }
}

// ── Attendance stats ─────────────────────────────────────────────────────────

export interface ClosedSession {
  startMs: number
  attended: boolean
}

/**
 * Attendance over closed sessions since the member joined.
 * streak = consecutive most-recent sessions attended.
 */
export function attendanceStats(sessions: ClosedSession[], joinedAtMs: number | null) {
  const relevant = sessions
    .filter(s => joinedAtMs === null || s.startMs >= joinedAtMs)
    .sort((a, b) => b.startMs - a.startMs)
  const attended = relevant.filter(s => s.attended).length
  let streak = 0
  for (const s of relevant) { if (s.attended) streak++; else break }
  let best = 0, run = 0
  for (const s of [...relevant].reverse()) { run = s.attended ? run + 1 : 0; best = Math.max(best, run) }
  return {
    total: relevant.length,
    attended,
    ratio: relevant.length ? attended / relevant.length : 0,
    streak,
    bestStreak: best,
  }
}
