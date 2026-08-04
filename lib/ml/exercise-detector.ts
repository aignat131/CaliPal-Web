/**
 * Multi-exercise detector — runs all 3 position gate classifiers in parallel
 * and uses a hysteresis state machine to determine the active exercise.
 *
 * Designed for the unified rep counter: user does squats, push-ups, pull-ups
 * in any order without pressing any buttons.
 */

import { loadPositionModel, classifyPosition } from './position-gate'
import type { Landmark } from './pose-math'

export type ExerciseType = 'pullup' | 'pushup' | 'squat'
export type DetectorState = 'LOADING' | 'DETECTING' | 'LOCKED'

const EXERCISE_TYPES: ExerciseType[] = ['pushup', 'pullup', 'squat']

// ── Tuning constants ────────────────────────────────────────────────────────

const INFERENCE_INTERVAL = 3       // run classifiers every 3rd frame (~10 Hz at 30 fps)
const ENTER_THRESHOLD = 4          // 4 consecutive positive detections to lock (~0.4s)
const EXIT_THRESHOLD = 12          // 12 consecutive negatives to unlock (~1.2s)
const MIN_PROBABILITY = 0.35       // absolute minimum classifier confidence
const MIN_MARGIN = 0.15            // winner must beat second place by this margin

// ── Detector ────────────────────────────────────────────────────────────────

export interface DetectionSnapshot {
  activeExercise: ExerciseType | null
  state: DetectorState
  probabilities: Record<ExerciseType, number>
}

export class ExerciseDetector {
  private _activeExercise: ExerciseType | null = null
  private _state: DetectorState = 'LOADING'
  private _probabilities: Record<ExerciseType, number> = { pushup: 0, pullup: 0, squat: 0 }

  // Hysteresis counters
  private candidateExercise: ExerciseType | null = null
  private enterBuffer = 0
  private exitBuffer = 0

  // Frame throttle
  private frameCount = 0
  private pendingInference = false

  // Mid-rep lock — prevents switching while the user is mid-repetition
  private _repInProgress = false

  get activeExercise(): ExerciseType | null { return this._activeExercise }
  get detectorState(): DetectorState { return this._state }
  get probabilities(): Record<ExerciseType, number> { return this._probabilities }

  /** Pre-load all 3 position gate models. Non-blocking, call once at startup. */
  async initialize(): Promise<void> {
    this._state = 'LOADING'
    await Promise.all(EXERCISE_TYPES.map(t => loadPositionModel(t)))
    this._state = 'DETECTING'
  }

  /** Set by the parent when a rep counter is mid-repetition. Prevents exercise switching. */
  setRepInProgress(v: boolean): void {
    this._repInProgress = v
  }

  /** Reset to initial detecting state. */
  reset(): void {
    this._activeExercise = null
    this._state = this._state === 'LOADING' ? 'LOADING' : 'DETECTING'
    this._probabilities = { pushup: 0, pullup: 0, squat: 0 }
    this.candidateExercise = null
    this.enterBuffer = 0
    this.exitBuffer = 0
    this.frameCount = 0
    this.pendingInference = false
    this._repInProgress = false
  }

  /**
   * Call every frame from the rAF loop. Returns the current detection snapshot.
   * Internally fires async inference on every INFERENCE_INTERVAL-th frame.
   */
  update(landmarks: Landmark[]): DetectionSnapshot {
    this.frameCount++

    if (this._state !== 'LOADING'
      && this.frameCount % INFERENCE_INTERVAL === 0
      && !this.pendingInference) {
      this.pendingInference = true
      Promise.all(
        EXERCISE_TYPES.map(t => classifyPosition(t, landmarks))
      ).then(([pushup, pullup, squat]) => {
        this.pendingInference = false
        this._probabilities = {
          pushup: pushup ?? 0,
          pullup: pullup ?? 0,
          squat: squat ?? 0,
        }
        this.processClassification()
      }).catch(() => {
        this.pendingInference = false
      })
    }

    return this.snapshot()
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private processClassification(): void {
    const winner = this.pickWinner()

    if (this._state === 'DETECTING' || this._activeExercise === null) {
      // No exercise locked — try to lock one
      if (winner) {
        if (winner === this.candidateExercise) {
          this.enterBuffer++
        } else {
          this.candidateExercise = winner
          this.enterBuffer = 1
        }
        if (this.enterBuffer >= ENTER_THRESHOLD) {
          this._activeExercise = winner
          this._state = 'LOCKED'
          this.candidateExercise = null
          this.enterBuffer = 0
          this.exitBuffer = 0
        }
      } else {
        this.candidateExercise = null
        this.enterBuffer = 0
      }
    } else {
      // Exercise is locked — check if we should exit
      if (winner === this._activeExercise) {
        // Still the same exercise — reset exit counter
        this.exitBuffer = 0
        this.candidateExercise = null
        this.enterBuffer = 0
      } else if (this._repInProgress) {
        // Mid-rep — never switch
        this.exitBuffer = 0
      } else {
        this.exitBuffer++

        // Track potential next exercise
        if (winner) {
          if (winner === this.candidateExercise) {
            this.enterBuffer++
          } else {
            this.candidateExercise = winner
            this.enterBuffer = 1
          }
        }

        if (this.exitBuffer >= EXIT_THRESHOLD) {
          // Exited current exercise — switch to candidate or go to DETECTING
          if (this.candidateExercise && this.enterBuffer >= ENTER_THRESHOLD) {
            this._activeExercise = this.candidateExercise
            this._state = 'LOCKED'
          } else {
            this._activeExercise = null
            this._state = 'DETECTING'
          }
          this.candidateExercise = null
          this.enterBuffer = 0
          this.exitBuffer = 0
        }
      }
    }
  }

  private pickWinner(): ExerciseType | null {
    const entries = EXERCISE_TYPES.map(t => ({ type: t, prob: this._probabilities[t] }))
    entries.sort((a, b) => b.prob - a.prob)

    const best = entries[0]
    const second = entries[1]

    if (best.prob < MIN_PROBABILITY) return null
    if (best.prob - second.prob < MIN_MARGIN) return null

    return best.type
  }

  private snapshot(): DetectionSnapshot {
    return {
      activeExercise: this._activeExercise,
      state: this._state,
      probabilities: { ...this._probabilities },
    }
  }
}
