import type { WorkoutExercise, WorkoutSet, WorkoutCircuit } from '@/types'
import type { ExerciseType } from '@/lib/ml/form-coach'
import type { HoldExerciseType } from '@/lib/ml/hold-detector'

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date()
  return d.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function totalRepsInWorkout(exercises: WorkoutExercise[]): number {
  return exercises.flatMap(e => e.sets).reduce((sum, s) => sum + (s.reps ?? 0), 0)
}

/** "Tracțiuni · 3×10 rep · +15kg" — compact one-liner for an exercise. */
export function exerciseOneLiner(ex: WorkoutExercise): string {
  const n = ex.sets.length
  if (n === 0) return ex.name
  const first = ex.sets[0]

  function setLabel(s: WorkoutSet): string {
    let base: string
    if (s.reps != null) {
      if (s.timedDurationSeconds) base = `${s.reps} rep în ${formatDuration(s.timedDurationSeconds)}`
      else if (s.durationSeconds && s.durationSeconds > 0) base = `${s.reps} (${s.durationSeconds}s)`
      else base = `${s.reps}`
    } else {
      base = s.durationSeconds != null ? `${s.durationSeconds}s` : '—'
    }
    const mod  = s.weightKg ? ` +${s.weightKg}kg` : s.bandKg ? ` ~${s.bandKg}kg` : ''
    const rec  = s.recorded ? ' 📹' : ''
    return base + mod + rec
  }

  const allSame = ex.sets.every(s =>
    s.reps === first.reps &&
    s.durationSeconds === first.durationSeconds &&
    s.weightKg === first.weightKg &&
    s.bandKg === first.bandKg &&
    s.timedDurationSeconds === first.timedDurationSeconds
  )

  if (allSame) {
    const modSuffix = first.weightKg ? ` +${first.weightKg}kg` : first.bandKg ? ` ~${first.bandKg}kg` : ''
    const repDur = first.reps != null && first.durationSeconds && first.durationSeconds > 0 ? ` (${first.durationSeconds}s)` : ''
    const valStr = first.reps != null
      ? first.timedDurationSeconds
        ? `${first.reps} rep în ${formatDuration(first.timedDurationSeconds)}`
        : `${first.reps} rep${repDur}`
      : `${first.durationSeconds ?? 0}s`
    return `${ex.name} · ${n}×${valStr}${modSuffix}`
  }

  return `${ex.name} · ${ex.sets.map(setLabel).join(', ')}`
}

/** Locale-safe "yyyy-MM-dd" from a Date — avoids toDateString() timezone issues. */
export function localDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

/** Normalize string for diacritic-insensitive search. */
export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Map exercise name to a supported camera-counting type, or null if unsupported. */
export function getExerciseType(name: string): ExerciseType | null {
  const n = norm(name)
  if (n.includes('tractiuni') || n.includes('chin-up') || n.includes('chinup') || n.includes('australian')) return 'pullup'
  if (n.includes('flotari') || n.includes('flotare') || n.includes('push-up') || n.includes('pushup') || n.includes('diamond') || n.includes('pike')) return 'pushup'
  if (n.includes('squat')) return 'squat'
  return null
}

/** Map exercise name to a supported camera-timed hold type, or null if unsupported. */
export function getHoldExerciseType(name: string): HoldExerciseType | null {
  const n = norm(name)
  if (n.includes('dead hang') || n.includes('atarnat')) return 'dead_hang'
  if (n.includes('l-sit') || n.includes('l sit')) return 'l_sit'
  if (n.includes('handstand')) return 'handstand'
  if (n.includes('front lever')) return 'front_lever'
  if (n.includes('planche')) return 'planche'
  return null
}

// ── Circuit helpers ──────────────────────────────────────────────────────────

export function circuitSummaryLine(circuit: WorkoutCircuit, exercises: WorkoutExercise[]): string {
  return circuit.exerciseIndices
    .map(i => exercises[i]?.name ?? '?')
    .join(' + ')
}

export function formatCircuitRounds(circuit: WorkoutCircuit): string {
  return circuit.rounds.map(r => formatDuration(r.durationSeconds)).join(', ')
}

export function circuitAverage(circuit: WorkoutCircuit): number {
  if (circuit.rounds.length === 0) return 0
  return Math.round(circuit.rounds.reduce((sum, r) => sum + r.durationSeconds, 0) / circuit.rounds.length)
}

export function circuitTotal(circuit: WorkoutCircuit): number {
  return circuit.rounds.reduce((sum, r) => sum + r.durationSeconds, 0)
}
