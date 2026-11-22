/**
 * Progress overview — one summary row per member for the coach's "Progress"
 * tab. Pure logic: the API route loads the raw docs, this turns them into rows.
 */
import type { MemberRole } from '@/types'
import { exerciseCompletion } from './goals'
import { testStatus } from './progress'

export interface MemberProgressRow {
  uid: string
  name: string
  photoUrl: string | null
  role: MemberRole
  points: number
  /** In-progress goals, newest first (skill + target only). */
  activeGoals: { skill: string; target: string; deadline: string | null }[]
  achievedGoals: number
  /** Active extra exercises: ticks done / expected this week, and 4-week ratio. */
  exercises: { count: number; doneThisWeek: number; expectedThisWeek: number; ratio4w: number | null }
  journalThisWeek: boolean
  lastJournalWeek: string | null
  lastTest: string | null
  testDue: boolean
  tips: number
  lastTipMs: number | null
  /** Needs the coach's attention: no goals, no exercises, or overdue stuff. */
  needsAttention: boolean
}

export interface ProgressOverviewResponse {
  ok: true
  week: string
  members: MemberProgressRow[]
}

export interface RawMemberData {
  uid: string
  name: string
  photoUrl: string | null
  role: MemberRole
  points: number
  goals: { skill: string; target: string; deadline: string | null; status: string; createdAtMs: number | null }[]
  exercises: { active: boolean; perWeek: number; checks: Record<string, number> }[]
  journalWeeks: string[]
  testDates: string[]
  tipTimesMs: number[]
}

export function buildMemberRow(raw: RawMemberData, week: string, today: string, testIntervalWeeks: number): MemberProgressRow {
  const active = raw.goals
    .filter(g => g.status !== 'ACHIEVED')
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
  const ex = raw.exercises.filter(e => e.active)
  const doneThisWeek = ex.reduce((s, e) => s + Math.min(e.perWeek, e.checks[week] ?? 0), 0)
  const expectedThisWeek = ex.reduce((s, e) => s + e.perWeek, 0)
  let done4 = 0
  let exp4 = 0
  for (const e of ex) {
    const c = exerciseCompletion(e, week)
    done4 += c.done
    exp4 += c.expected
  }
  const journalWeeks = [...raw.journalWeeks].sort()
  const test = testStatus(raw.testDates.map(date => ({ date, values: {} })), testIntervalWeeks, today)
  const lastTipMs = raw.tipTimesMs.length ? Math.max(...raw.tipTimesMs) : null

  return {
    uid: raw.uid,
    name: raw.name,
    photoUrl: raw.photoUrl,
    role: raw.role,
    points: raw.points,
    activeGoals: active.slice(0, 5).map(g => ({ skill: g.skill, target: g.target, deadline: g.deadline })),
    achievedGoals: raw.goals.length - active.length,
    exercises: { count: ex.length, doneThisWeek, expectedThisWeek, ratio4w: exp4 > 0 ? done4 / exp4 : null },
    journalThisWeek: journalWeeks.includes(week),
    lastJournalWeek: journalWeeks.pop() ?? null,
    lastTest: test.last,
    testDue: test.due,
    tips: raw.tipTimesMs.length,
    lastTipMs,
    needsAttention: active.length === 0 || ex.length === 0,
  }
}
