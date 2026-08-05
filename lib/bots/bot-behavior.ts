// ── Bot Difficulty & Rep Timing ──────────────────────────────────────────────

export type BotDifficulty = 'EASY' | 'MEDIUM' | 'HARD'

type ExerciseKey = 'pushup' | 'pullup' | 'squat'

/** Min/max interval in ms between reps, per exercise and difficulty. */
const REP_INTERVALS: Record<BotDifficulty, Record<ExerciseKey, [number, number]>> = {
  EASY: {
    pushup: [2000, 4000],
    pullup: [3000, 5000],
    squat:  [2500, 4500],
  },
  MEDIUM: {
    pushup: [1000, 2000],
    pullup: [1500, 2500],
    squat:  [1200, 2200],
  },
  HARD: {
    pushup: [600, 1200],
    pullup: [900, 1800],
    squat:  [700, 1500],
  },
}

const DEFAULT_INTERVAL: [number, number] = [1000, 2000]

/** Reps before a rest pause. */
const PAUSE_AFTER_MIN = 8
const PAUSE_AFTER_MAX = 15

/** Rest pause duration range in ms. */
const PAUSE_DURATION: Record<BotDifficulty, [number, number]> = {
  EASY:   [3000, 5000],
  MEDIUM: [2000, 4000],
  HARD:   [1500, 3000],
}

/** Uniform random in [min, max]. */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Returns the delay in ms until the bot's next rep.
 * Includes periodic rest pauses for realism.
 */
export function getNextRepDelay(
  exerciseType: string | null,
  difficulty: BotDifficulty,
  repsSoFar: number,
): number {
  // Check if bot should take a rest pause
  if (repsSoFar > 0 && shouldPause(repsSoFar)) {
    const [pMin, pMax] = PAUSE_DURATION[difficulty]
    return rand(pMin, pMax)
  }

  const key = (exerciseType ?? 'pushup') as ExerciseKey
  const [min, max] = REP_INTERVALS[difficulty]?.[key] ?? DEFAULT_INTERVAL
  return rand(min, max)
}

/** Bots pause every 8–15 reps to simulate catching breath. */
function shouldPause(repsSoFar: number): boolean {
  // Decide on a pseudo-random cycle length for this rep count
  const cycleLen = PAUSE_AFTER_MIN + (repsSoFar % (PAUSE_AFTER_MAX - PAUSE_AFTER_MIN + 1))
  return repsSoFar % cycleLen === 0
}
