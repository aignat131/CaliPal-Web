import { describe, expect, it } from 'vitest'
import { computeRecords, liftForExercise, formatRecordValue, emptyRecords } from '../records'
import { BADGE_BY_ID, evaluateBadges, levelFor, tierName, badgeDesc, type BadgeStats } from '../badges'
import type { WorkoutSet } from '@/types'

const at = (iso: string) => ({ toDate: () => new Date(iso) })
const w = (createdAt: string, exercises: { name: string; sets: WorkoutSet[] }[]) =>
  ({ createdAt: at(createdAt), exercises: exercises.map(e => ({ ...e, category: '' })) })

function stats(over: Partial<BadgeStats> = {}): BadgeStats {
  return {
    records: emptyRecords(), totalWorkouts: 0, currentStreak: 0, trainingsAttended: 0,
    friendCount: 0, battleWins: 0, skillsMastered: 0, completedPrograms: 0, ...over,
  }
}

describe('liftForExercise', () => {
  it('matches catalogue names regardless of diacritics, case and hyphens', () => {
    expect(liftForExercise('Tracțiuni')?.key).toBe('pullup')
    expect(liftForExercise('tractiuni pronat')?.key).toBe('pullup')
    expect(liftForExercise('Chin-up')?.key).toBe('pullup')
    expect(liftForExercise('Muscle-Up')?.key).toBe('muscleup')
    expect(liftForExercise('Handstand Hold')?.key).toBe('handstand')
  })
  it('ignores assisted, negative and weighted variants', () => {
    expect(liftForExercise('Tracțiuni cu bandă')).toBeNull()
    expect(liftForExercise('Tracțiuni negative')).toBeNull()
    expect(liftForExercise('Australian Pull-up')).toBeNull()
    expect(liftForExercise('Tracțiuni cu greutate')).toBeNull()
  })
})

describe('computeRecords', () => {
  it('takes the best single set, reps for reps lifts and seconds for holds', () => {
    const r = computeRecords([
      w('2026-01-01', [{ name: 'Tracțiuni', sets: [{ reps: 8 }, { reps: 12 }] }]),
      w('2026-02-01', [{ name: 'Chin-up', sets: [{ reps: 10 }] }]),
      w('2026-03-01', [{ name: 'L-Sit', sets: [{ durationSeconds: 15 }, { durationSeconds: 22 }] }]),
    ])
    expect(r.pullup.value).toBe(12)
    expect(r.pullup.date?.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(r.lsit.value).toBe(22)
    expect(r.pushup.value).toBe(0)
  })
  it('does not use reps from a hold set or seconds from a reps set', () => {
    const r = computeRecords([w('2026-01-01', [
      { name: 'Flotări', sets: [{ reps: 20, durationSeconds: 60 }] },
      { name: 'Plank', sets: [{ reps: 5 }] },
    ])])
    expect(r.pushup.value).toBe(20)
    expect(r.plank.value).toBe(0)
  })
  it('prefers a camera-verified set on a tie', () => {
    const r = computeRecords([
      w('2026-01-01', [{ name: 'Flotări', sets: [{ reps: 30 }] }]),
      w('2026-01-02', [{ name: 'Flotări', sets: [{ reps: 30, recorded: true }] }]),
    ])
    expect(r.pushup.verified).toBe(true)
  })
})

describe('badges', () => {
  it('levels follow thresholds', () => {
    const def = BADGE_BY_ID.get('pullup_power')!
    expect(levelFor(def, 9)).toBe(0)
    expect(levelFor(def, 10)).toBe(1)
    expect(levelFor(def, 25)).toBe(2)
    expect(levelFor(def, 99)).toBe(3)
    expect(tierName(def, 2)).toBe('silver')
    expect(tierName(BADGE_BY_ID.get('first_pullup')!, 1)).toBe('special')
  })
  it('evaluates from records and counters', () => {
    const records = computeRecords([w('2026-01-01', [{ name: 'Tracțiuni', sets: [{ reps: 1 }] }])])
    const res = evaluateBadges(stats({ records, totalWorkouts: 12, currentStreak: 8 }))
    const get = (id: string) => res.find(r => r.def.id === id)!
    expect(get('first_pullup').level).toBe(1)
    expect(get('pullup_power').level).toBe(0)
    expect(get('pullup_power').next).toBe(10)
    expect(get('dedicated').level).toBe(1)
    expect(get('streak').level).toBe(1)
    expect(get('first_muscleup').level).toBe(0)
  })
  it('keeps stored levels when the live value drops (e.g. a broken streak)', () => {
    const res = evaluateBadges(stats({ currentStreak: 2 }), { streak: 2 })
    const streak = res.find(r => r.def.id === 'streak')!
    expect(streak.level).toBe(2)
    expect(streak.next).toBe(100)
  })
  it('fills the threshold into descriptions', () => {
    expect(badgeDesc(BADGE_BY_ID.get('pushup_power')!, 2, 'RO')).toBe('50 flotări într-o serie.')
    expect(badgeDesc(BADGE_BY_ID.get('pushup_power')!, 0, 'EN')).toBe('25 push-ups in one set.')
  })
  it('every badge has unique id and 1 or 3 ascending thresholds', () => {
    const ids = new Set<string>()
    for (const [id, def] of BADGE_BY_ID) {
      expect(ids.has(id)).toBe(false)
      ids.add(id)
      expect([1, 3]).toContain(def.thresholds.length)
      expect([...def.thresholds].sort((a, b) => a - b)).toEqual(def.thresholds)
    }
  })
})

describe('formatRecordValue', () => {
  it('formats reps and durations', () => {
    expect(formatRecordValue(15, 'reps')).toBe('15')
    expect(formatRecordValue(45, 'seconds')).toBe('45s')
    expect(formatRecordValue(120, 'seconds')).toBe('2m')
    expect(formatRecordValue(95, 'seconds')).toBe('1m 35s')
  })
})
