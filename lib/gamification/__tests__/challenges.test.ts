import { describe, expect, it } from 'vitest'
import { completionFrom, viewStatus } from '../challenges'

const ts = (d: Date) => ({ toDate: () => d }) as never
const future = ts(new Date(Date.now() + 86400000))
const past = ts(new Date(Date.now() - 1000))

describe('viewStatus', () => {
  it('open challenges past their deadline read as expired', () => {
    expect(viewStatus({ status: 'PENDING', deadline: past })).toBe('EXPIRED')
    expect(viewStatus({ status: 'ACCEPTED', deadline: past })).toBe('EXPIRED')
    expect(viewStatus({ status: 'ACCEPTED', deadline: future })).toBe('ACCEPTED')
  })
  it('finished challenges keep their status after the deadline', () => {
    expect(viewStatus({ status: 'COMPLETED', deadline: past })).toBe('COMPLETED')
    expect(viewStatus({ status: 'DECLINED', deadline: past })).toBe('DECLINED')
  })
})

describe('completionFrom', () => {
  const ex = (name: string, sets: object[]) => ({ name, category: '', sets })
  it('completes when the best set reaches the target', () => {
    const w = { exercises: [ex('Tracțiuni', [{ reps: 9 }, { reps: 12, recorded: true }])] }
    expect(completionFrom({ lift: 'pullup', target: 12 }, w)).toEqual({ result: 12, verified: true })
    expect(completionFrom({ lift: 'pullup', target: 13 }, w)).toBeNull()
  })
  it('ignores dictated sets and backdated workouts', () => {
    expect(completionFrom({ lift: 'pushup', target: 10 },
      { exercises: [ex('Flotări', [{ reps: 30, source: 'voice' }])] })).toBeNull()
    expect(completionFrom({ lift: 'pushup', target: 10 },
      { backdated: true, exercises: [ex('Flotări', [{ reps: 30 }])] })).toBeNull()
  })
  it('uses seconds for holds', () => {
    expect(completionFrom({ lift: 'plank', target: 60 },
      { exercises: [ex('Plank', [{ durationSeconds: 75 }])] })?.result).toBe(75)
  })
})
