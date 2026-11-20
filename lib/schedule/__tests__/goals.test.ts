import { describe, it, expect } from 'vitest'
import {
  goalRewardDecision, exerciseCompletion, attendanceStats, formatPrescription, GOAL_MIN_AGE_MS,
} from '../goals'

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 20, 12)

describe('goal rewards', () => {
  it('rewards an old enough goal once', () => {
    expect(goalRewardDecision({ now, goalCreatedAtMs: now - 10 * DAY, alreadyRewarded: false, recentRewardTimesMs: [] }))
      .toEqual({ reward: true })
    expect(goalRewardDecision({ now, goalCreatedAtMs: now - 10 * DAY, alreadyRewarded: true, recentRewardTimesMs: [] }))
      .toEqual({ reward: false, reason: 'already-rewarded' })
  })

  it('does not reward goals created less than 7 days ago (anti-farming)', () => {
    expect(goalRewardDecision({ now, goalCreatedAtMs: now - GOAL_MIN_AGE_MS + 1000, alreadyRewarded: false, recentRewardTimesMs: [] }))
      .toEqual({ reward: false, reason: 'too-new' })
    expect(goalRewardDecision({ now, goalCreatedAtMs: null, alreadyRewarded: false, recentRewardTimesMs: [] }))
      .toEqual({ reward: false, reason: 'too-new' })
  })

  it('caps rewarded goals at 2 per rolling 30 days', () => {
    const base = { now, goalCreatedAtMs: now - 20 * DAY, alreadyRewarded: false }
    expect(goalRewardDecision({ ...base, recentRewardTimesMs: [now - 2 * DAY, now - 5 * DAY] }))
      .toEqual({ reward: false, reason: 'limit' })
    expect(goalRewardDecision({ ...base, recentRewardTimesMs: [now - 2 * DAY, now - 40 * DAY] }))
      .toEqual({ reward: true })
  })
})

describe('extra exercises', () => {
  it('formats the prescription', () => {
    expect(formatPrescription({ sets: 3, amount: 8, unit: 'reps', perWeek: 2 })).toBe('3 × 8 rep · 2×/săpt.')
    expect(formatPrescription({ sets: 4, amount: 20, unit: 'sec', perWeek: 3 })).toBe('4 × 20 sec · 3×/săpt.')
  })

  it('computes completion over the last 4 weeks, capped at the weekly target', () => {
    const e = { perWeek: 2, checks: { '2026-11-16': 2, '2026-11-09': 5, '2026-11-02': 1, '2026-10-01': 2 } }
    expect(exerciseCompletion(e, '2026-11-16')).toEqual({ done: 5, expected: 8, ratio: 5 / 8 })
  })
})

describe('attendance stats', () => {
  const s = (daysAgo: number, attended: boolean) => ({ startMs: now - daysAgo * DAY, attended })

  it('computes %, current streak and best streak', () => {
    const r = attendanceStats([s(1, true), s(3, true), s(5, false), s(7, true), s(9, true), s(11, true)], null)
    expect(r).toEqual({ total: 6, attended: 5, ratio: 5 / 6, streak: 2, bestStreak: 3 })
  })

  it('only counts sessions since the member joined', () => {
    const r = attendanceStats([s(1, true), s(30, false)], now - 10 * DAY)
    expect(r.total).toBe(1)
    expect(r.ratio).toBe(1)
  })

  it('handles no sessions', () => {
    expect(attendanceStats([], null)).toEqual({ total: 0, attended: 0, ratio: 0, streak: 0, bestStreak: 0 })
  })
})
