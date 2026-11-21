import type { WorkoutDoc, WorkoutSet } from '@/types'

// Personal records for the headline calisthenics lifts, computed from a user's
// workout history (users/{uid}/workouts). A record is the best single set.

export type LiftKey =
  | 'pullup' | 'pushup' | 'dips' | 'squat' | 'muscleup'
  | 'handstand' | 'lsit' | 'plank' | 'front_lever' | 'dead_hang'

export interface LiftDef {
  key: LiftKey
  icon: string
  name: { RO: string; EN: string }
  metric: 'reps' | 'seconds'
  /** Normalized exercise names (see normName) that count toward this lift. */
  names: string[]
}

export function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

const n = (...names: string[]) => names.map(normName)

export const LIFTS: LiftDef[] = [
  { key: 'pullup', icon: '🆙', metric: 'reps', name: { RO: 'Tracțiuni', EN: 'Pull-ups' },
    names: n('Tracțiuni', 'Tracțiuni pronat', 'Tracțiuni supinat', 'Tracțiuni neutru', 'Chin-up',
      'Pull-up', 'Pull-ups', 'Pullup', 'Pullups', 'Tractiune') },
  { key: 'pushup', icon: '💪', metric: 'reps', name: { RO: 'Flotări', EN: 'Push-ups' },
    names: n('Flotări', 'Flotare', 'Push-up', 'Push-ups', 'Pushup', 'Pushups') },
  { key: 'dips', icon: '🔻', metric: 'reps', name: { RO: 'Dips', EN: 'Dips' },
    names: n('Dips', 'Dip', 'Ring Dip', 'Paralele') },
  { key: 'squat', icon: '🦵', metric: 'reps', name: { RO: 'Squaturi', EN: 'Squats' },
    names: n('Squaturi', 'Squat', 'Squats', 'Genuflexiuni') },
  { key: 'muscleup', icon: '🚀', metric: 'reps', name: { RO: 'Muscle-up', EN: 'Muscle-ups' },
    names: n('Muscle-Up', 'Muscle-ups', 'Muscle up') },
  { key: 'handstand', icon: '🤸', metric: 'seconds', name: { RO: 'Handstand', EN: 'Handstand' },
    names: n('Handstand Hold', 'Handstand') },
  { key: 'lsit', icon: '🪑', metric: 'seconds', name: { RO: 'L-Sit', EN: 'L-Sit' },
    names: n('L-Sit', 'L Sit') },
  { key: 'plank', icon: '🧱', metric: 'seconds', name: { RO: 'Plank', EN: 'Plank' },
    names: n('Plank', 'Planșă') },
  { key: 'front_lever', icon: '🛸', metric: 'seconds', name: { RO: 'Front Lever', EN: 'Front Lever' },
    names: n('Front Lever') },
  { key: 'dead_hang', icon: '🪝', metric: 'seconds', name: { RO: 'Dead Hang', EN: 'Dead Hang' },
    names: n('Dead Hang', 'Atârnat') },
]

const LIFT_BY_NAME = new Map<string, LiftDef>()
for (const l of LIFTS) for (const nm of l.names) LIFT_BY_NAME.set(nm, l)

export function liftForExercise(name: string): LiftDef | null {
  return LIFT_BY_NAME.get(normName(name)) ?? null
}

export interface PersonalRecord {
  key: LiftKey
  value: number          // reps, or seconds for holds; 0 = no record yet
  date: Date | null
  /** Best set was counted by the camera (AI), not typed or dictated. */
  verified: boolean
}

export type RecordMap = Record<LiftKey, PersonalRecord>

function setValue(set: WorkoutSet, metric: LiftDef['metric']): number {
  return metric === 'reps' ? (set.reps ?? 0) : (set.durationSeconds ?? 0)
}

type WorkoutLike = Pick<WorkoutDoc, 'exercises'> & {
  createdAt?: { toDate?: () => Date } | null
  backdated?: boolean
}

export function emptyRecords(): RecordMap {
  const out = {} as RecordMap
  for (const l of LIFTS) out[l.key] = { key: l.key, value: 0, date: null, verified: false }
  return out
}

/**
 * `competitive` applies the leaderboard rules used elsewhere in the app:
 * dictated (voice) sets and workouts logged for a past day don't count.
 */
export function computeRecords(workouts: WorkoutLike[], opts: { competitive?: boolean } = {}): RecordMap {
  const out = emptyRecords()
  for (const w of workouts) {
    if (opts.competitive && w.backdated) continue
    const date = w.createdAt?.toDate?.() ?? null
    for (const ex of w.exercises ?? []) {
      const lift = liftForExercise(ex.name)
      if (!lift) continue
      for (const s of ex.sets ?? []) {
        if (opts.competitive && s.source === 'voice') continue
        const v = setValue(s, lift.metric)
        if (v <= 0) continue
        const cur = out[lift.key]
        const verified = s.recorded === true
        // Higher wins; on a tie, a camera-verified set beats an unverified one.
        if (v > cur.value || (v === cur.value && verified && !cur.verified)) {
          out[lift.key] = { key: lift.key, value: v, date, verified }
        }
      }
    }
  }
  return out
}

/** Lifts improved by `latest` compared with the records from earlier workouts. */
export function newRecords(previous: RecordMap, latest: WorkoutLike): PersonalRecord[] {
  const after = computeRecords([latest])
  return LIFTS
    .map(l => after[l.key])
    .filter(r => r.value > 0 && r.value > previous[r.key].value)
}

export function formatRecordValue(value: number, metric: LiftDef['metric']): string {
  if (metric === 'reps') return `${value}`
  if (value < 60) return `${value}s`
  const m = Math.floor(value / 60)
  const s = value % 60
  return s ? `${m}m ${s}s` : `${m}m`
}
