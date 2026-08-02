import type { BattleExerciseType } from './types'

/**
 * Maximum rep rate per exercise type (minimum milliseconds between reps).
 * Based on realistic human performance limits.
 */
const MAX_REP_RATE: Record<string, number> = {
  pushup: 500,   // max ~2 reps/sec
  pullup: 800,   // max ~1.25 reps/sec
  squat: 600,    // max ~1.67 reps/sec
  default: 300,  // manual mode fallback
}

/** Get the minimum interval in ms between reps for a given exercise type. */
export function getMinRepInterval(exerciseType: BattleExerciseType | null): number {
  if (!exerciseType) return MAX_REP_RATE.default
  return MAX_REP_RATE[exerciseType] ?? MAX_REP_RATE.default
}

/**
 * Check if a rep increment is valid (not too fast).
 * Returns true if the rep should be counted.
 */
export function isRepValid(
  exerciseType: BattleExerciseType | null,
  lastRepTimestamp: number | null,
): boolean {
  if (!lastRepTimestamp) return true
  const minInterval = getMinRepInterval(exerciseType)
  return Date.now() - lastRepTimestamp >= minInterval
}
