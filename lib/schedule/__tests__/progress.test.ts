import { describe, it, expect } from 'vitest'
import { journalRows, trainingDaysInWeek } from '../progress'

describe('journal', () => {
  it('pre-generates one row per week, newest first, merging saved entries', () => {
    const rows = journalRows({ '2026-11-09': { trainings: 3, worked: 'pull', progress: '', notes: '' } }, '2026-11-16', 3)
    expect(rows.map(r => [r.week, r.saved, r.trainings])).toEqual([
      ['2026-11-16', false, 0],
      ['2026-11-09', true, 3],
      ['2026-11-02', false, 0],
    ])
  })

  it('suggests trainings = distinct days with activity in that week', () => {
    const days = ['2026-11-16', '2026-11-16', '2026-11-18', '2026-11-22', '2026-11-23', '2026-11-15']
    expect(trainingDaysInWeek(days, '2026-11-16')).toBe(3) // 16, 18, 22 (Sunday)
  })
})
