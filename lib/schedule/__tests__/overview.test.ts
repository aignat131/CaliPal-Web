import { describe, it, expect } from 'vitest'
import { buildMemberRow, type RawMemberData } from '../overview'

const week = '2026-11-16'

const base: RawMemberData = {
  uid: 'u1', name: 'Ana', photoUrl: null, role: 'MEMBER', points: 40,
  goals: [], exercises: [], journalWeeks: [], tipTimesMs: [],
}

describe('progress overview row', () => {
  it('flags a member with no goals or exercises', () => {
    const r = buildMemberRow(base, week)
    expect(r.needsAttention).toBe(true)
    expect(r.exercises).toEqual({ count: 0, doneThisWeek: 0, expectedThisWeek: 0, ratio4w: null })
    expect(r.lastJournalWeek).toBeNull()
  })

  it('summarises goals, newest active first', () => {
    const r = buildMemberRow({
      ...base,
      goals: [
        { skill: 'L-sit', target: '20s', deadline: null, status: 'IN_PROGRESS', createdAtMs: 1 },
        { skill: 'Muscle-up', target: '1 rep', deadline: '2027-01-01', status: 'IN_PROGRESS', createdAtMs: 5 },
        { skill: 'Handstand', target: '', deadline: null, status: 'ACHIEVED', createdAtMs: 3 },
      ],
    }, week)
    expect(r.activeGoals.map(g => g.skill)).toEqual(['Muscle-up', 'L-sit'])
    expect(r.achievedGoals).toBe(1)
  })

  it('counts only active exercises, capped at perWeek', () => {
    const r = buildMemberRow({
      ...base,
      exercises: [
        { active: true, perWeek: 3, checks: { [week]: 5 } },
        { active: true, perWeek: 2, checks: { [week]: 1 } },
        { active: false, perWeek: 4, checks: { [week]: 4 } },
      ],
    }, week)
    expect(r.exercises.count).toBe(2)
    expect(r.exercises.doneThisWeek).toBe(4)
    expect(r.exercises.expectedThisWeek).toBe(5)
    expect(r.exercises.ratio4w).toBeCloseTo(4 / 20)
  })

  it('reads journal and tips', () => {
    const r = buildMemberRow({
      ...base,
      journalWeeks: ['2026-11-02', week],
      tipTimesMs: [10, 30, 20],
    }, week)
    expect(r.journalThisWeek).toBe(true)
    expect(r.lastJournalWeek).toBe(week)
    expect(r.tips).toBe(3)
    expect(r.lastTipMs).toBe(30)
  })
})
