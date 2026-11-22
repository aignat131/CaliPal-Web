import type { WorkoutDoc } from '@/types'

/** ISO 8601 week ID (Monday-based), e.g. "2026-W31". */
export function getWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export interface ExerciseStats {
  name: string
  category: string
  totalReps: number
  totalSets: number
  totalWorkouts: number
  prReps: number
  prDate: Date | null
  weeklyReps: { weekLabel: string; weekId: string; reps: number }[]
}

/** Normalize exercise name for grouping (diacritic-insensitive). */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Compute per-exercise stats from a user's workout history. */
export function computeExerciseStats(history: WorkoutDoc[]): ExerciseStats[] {
  const byKey = new Map<string, {
    name: string
    category: string
    totalReps: number
    totalSets: number
    workoutIds: Set<string>
    prReps: number
    prDate: Date | null
    weeklyMap: Map<string, number>
  }>()

  for (const w of history) {
    const wDate = w.createdAt?.toDate?.() ?? new Date()
    const weekId = getWeekId(wDate)

    for (const ex of w.exercises) {
      const key = norm(ex.name)
      let entry = byKey.get(key)
      if (!entry) {
        entry = {
          name: ex.name,
          category: ex.category,
          totalReps: 0,
          totalSets: 0,
          workoutIds: new Set(),
          prReps: 0,
          prDate: null,
          weeklyMap: new Map(),
        }
        byKey.set(key, entry)
      }

      // Use most recent spelling
      if (!entry.workoutIds.size || wDate >= (entry.prDate ?? new Date(0))) {
        entry.name = ex.name
        entry.category = ex.category
      }

      entry.workoutIds.add(w.id)
      entry.totalSets += ex.sets.length

      for (const s of ex.sets) {
        const reps = s.reps ?? 0
        entry.totalReps += reps

        if (reps > entry.prReps) {
          entry.prReps = reps
          entry.prDate = wDate
        }
      }

      // Weekly aggregation
      const prev = entry.weeklyMap.get(weekId) ?? 0
      const exReps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
      entry.weeklyMap.set(weekId, prev + exReps)
    }
  }

  // Build last 8 weeks of labels
  const now = new Date()
  const weekIds: string[] = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    weekIds.push(getWeekId(d))
  }

  const results: ExerciseStats[] = []
  for (const entry of byKey.values()) {
    results.push({
      name: entry.name,
      category: entry.category,
      totalReps: entry.totalReps,
      totalSets: entry.totalSets,
      totalWorkouts: entry.workoutIds.size,
      prReps: entry.prReps,
      prDate: entry.prDate,
      weeklyReps: weekIds.map(wid => ({
        weekLabel: wid.split('-W')[1],
        weekId: wid,
        reps: entry.weeklyMap.get(wid) ?? 0,
      })),
    })
  }

  // Sort by total reps descending
  results.sort((a, b) => b.totalReps - a.totalReps)
  return results
}
