import type { WorkoutExercise, WorkoutSet } from '@/types'
import type { ExerciseType } from '@/lib/ml/form-coach'

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
    const base = s.reps != null ? `${s.reps}` : s.durationSeconds != null ? `${s.durationSeconds}s` : '—'
    const mod  = s.weightKg ? ` +${s.weightKg}kg` : s.bandKg ? ` ~${s.bandKg}kg` : ''
    return base + mod
  }

  const allSame = ex.sets.every(s =>
    s.reps === first.reps &&
    s.durationSeconds === first.durationSeconds &&
    s.weightKg === first.weightKg &&
    s.bandKg === first.bandKg
  )

  if (allSame) {
    const modSuffix = first.weightKg ? ` +${first.weightKg}kg` : first.bandKg ? ` ~${first.bandKg}kg` : ''
    const valStr = first.reps != null ? `${first.reps} rep` : `${first.durationSeconds ?? 0}s`
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
