import { describe, it, expect } from 'vitest'
import {
  sanitizeTestConfig, sanitizeTestValues, testStatus, metricSeries, seriesDelta, journalRows,
  trainingDaysInWeek, metricId, DEFAULT_TEST_METRICS,
} from '../progress'

describe('test config', () => {
  it('defaults to 2 weeks and the 5 standard metrics', () => {
    const c = sanitizeTestConfig(undefined)
    expect(c.intervalWeeks).toBe(2)
    expect(c.metrics.map(m => m.id)).toEqual(['pullups', 'pushups', 'dips', 'lsit', 'handstand'])
  })

  it('accepts custom metrics and drops invalid/duplicate ones', () => {
    const c = sanitizeTestConfig({
      testIntervalWeeks: 3,
      testMetrics: [{ id: 'mu', name: 'Muscle-ups', unit: 'rep' }, { id: 'mu', name: 'Dup', unit: 'rep' }, { id: '', name: 'x' }, { id: 'w', name: 'Greutate', unit: 'zz' }],
    })
    expect(c.intervalWeeks).toBe(3)
    expect(c.metrics).toEqual([{ id: 'mu', name: 'Muscle-ups', unit: 'rep' }, { id: 'w', name: 'Greutate', unit: 'rep' }])
    expect(sanitizeTestConfig({ testIntervalWeeks: 99 }).intervalWeeks).toBe(2)
  })

  it('slugifies metric names (diacritics too)', () => {
    expect(metricId('Tracțiuni cu greutate')).toBe('tractiuni_cu_greutate')
    expect(metricId('!!!')).toBe('metric')
  })

  it('keeps only known, sane values', () => {
    expect(sanitizeTestValues({ pullups: 12, lsit: 15.55, hacker: 5, dips: -3, pushups: 'x' }, DEFAULT_TEST_METRICS))
      .toEqual({ pullups: 12, lsit: 15.6 })
  })
})

describe('test schedule', () => {
  const t = (date: string) => ({ date, values: {} })

  it('first test is due immediately', () => {
    expect(testStatus([], 2, '2026-11-20')).toEqual({ last: null, next: '2026-11-20', due: true, overdueDays: 0 })
  })

  it('next test is due interval weeks after the last one', () => {
    expect(testStatus([t('2026-11-01'), t('2026-11-10')], 2, '2026-11-20'))
      .toEqual({ last: '2026-11-10', next: '2026-11-24', due: false, overdueDays: 0 })
    expect(testStatus([t('2026-11-01')], 2, '2026-11-20'))
      .toEqual({ last: '2026-11-01', next: '2026-11-15', due: true, overdueDays: 5 })
  })
})

describe('series', () => {
  const tests = [
    { date: '2026-11-15', values: { pullups: 12 } },
    { date: '2026-10-18', values: { pullups: 8, lsit: 10 } },
    { date: '2026-11-01', values: { lsit: 14 } },
  ]
  it('builds an ordered series per metric, skipping missing values', () => {
    expect(metricSeries(tests, 'pullups')).toEqual([{ date: '2026-10-18', value: 8 }, { date: '2026-11-15', value: 12 }])
    expect(metricSeries(tests, 'lsit').map(s => s.value)).toEqual([10, 14])
    expect(metricSeries(tests, 'dips')).toEqual([])
  })
  it('computes the change since the first test', () => {
    expect(seriesDelta(metricSeries(tests, 'pullups'))).toBe(4)
    expect(seriesDelta([{ value: 5 }])).toBe(null)
  })
})

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
