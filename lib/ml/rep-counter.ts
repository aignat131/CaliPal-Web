/**
 * Pull-up rep counter — port of RepetitionCounter.kt
 *
 * Thresholds (from plan):
 *   HANG_ENTER  = 148° — elbow angle above this → enter HANGING state
 *   HANG_EXIT   = 153° — elbow angle must be below this to leave HANGING (going up)
 *   PEAK        = 105° — elbow angle below this → rep peak reached
 *   CONFIRM     = 2    — consecutive frames needed to confirm state transition
 *   MIN_REP     = 20   — minimum frames between rep completions
 */

const HANG_ENTER = 148
const HANG_EXIT = 153
const PEAK_THRESHOLD = 105
const CONFIRM_FRAMES = 2
const MIN_REP_FRAMES = 20

export type RepState = 'IDLE' | 'HANGING' | 'PULLING' | 'PEAK' | 'LOWERING'

export interface RepCounterState {
  repCount: number
  state: RepState
  /** Current average elbow angle */
  currentAngle: number
  /** Frames since last completed rep */
  framesSinceRep: number
}

export class RepCounter {
  private repCount = 0
  private state: RepState = 'IDLE'
  private confirmBuffer = 0
  private framesSinceRep = 0
  private peakReached = false

  reset() {
    this.repCount = 0
    this.state = 'IDLE'
    this.confirmBuffer = 0
    this.framesSinceRep = 0
    this.peakReached = false
  }

  /**
   * Feed one frame's average elbow angle (degrees).
   * Returns updated state snapshot.
   */
  private snapshot(): RepCounterState {
    return { repCount: this.repCount, state: this.state, currentAngle: NaN, framesSinceRep: this.framesSinceRep }
  }

  update(avgElbow: number): RepCounterState {
    if (!isFinite(avgElbow)) return this.snapshot()
    this.framesSinceRep++

    switch (this.state) {
      case 'IDLE':
      case 'HANGING': {
        if (avgElbow >= HANG_ENTER) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.peakReached = false
          }
        } else if (this.state === 'HANGING' && avgElbow < HANG_EXIT) {
          // Started pulling up
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'PULLING'
            this.confirmBuffer = 0
          }
        } else {
          this.confirmBuffer = 0
          if (this.state === 'IDLE') this.state = 'HANGING'
        }
        break
      }

      case 'PULLING': {
        if (avgElbow <= PEAK_THRESHOLD) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'PEAK'
            this.peakReached = true
            this.confirmBuffer = 0
          }
        } else if (avgElbow >= HANG_ENTER) {
          // Dropped back without reaching peak — not a full rep
          this.state = 'HANGING'
          this.confirmBuffer = 0
        } else {
          this.confirmBuffer = 0
        }
        break
      }

      case 'PEAK': {
        if (avgElbow > PEAK_THRESHOLD) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'LOWERING'
            this.confirmBuffer = 0
          }
        } else {
          this.confirmBuffer = 0
        }
        break
      }

      case 'LOWERING': {
        if (avgElbow >= HANG_ENTER && this.peakReached) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES && this.framesSinceRep >= MIN_REP_FRAMES) {
            // Completed rep
            this.repCount++
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.framesSinceRep = 0
            this.peakReached = false
          }
        } else {
          this.confirmBuffer = 0
        }
        break
      }
    }

    return {
      repCount: this.repCount,
      state: this.state,
      currentAngle: avgElbow,
      framesSinceRep: this.framesSinceRep,
    }
  }
}

export const STATE_LABELS: Record<RepState, string> = {
  IDLE: 'Pregătire...',
  HANGING: 'Atârnă',
  PULLING: 'Tragere ↑',
  PEAK: 'Vârf ✓',
  LOWERING: 'Coborâre ↓',
}

export const STATE_COLORS: Record<RepState, string> = {
  IDLE: '#6B7280',
  HANGING: '#3B82F6',
  PULLING: '#F59E0B',
  PEAK: '#1ED75F',
  LOWERING: '#8B5CF6',
}

// ── Push-up Counter ───────────────────────────────────────────────────────────
// UP: elbow angle > 155° (arms extended)  DOWN: elbow angle < 90° (at bottom)

export type PushupState = 'IDLE' | 'UP' | 'DOWN' | 'RISING'

export class PushupCounter {
  private repCount = 0
  private state: PushupState = 'IDLE'
  private confirmBuffer = 0

  reset() { this.repCount = 0; this.state = 'IDLE'; this.confirmBuffer = 0 }

  update(avgElbow: number): { repCount: number; state: PushupState } {
    if (!isFinite(avgElbow)) return { repCount: this.repCount, state: this.state }
    switch (this.state) {
      case 'IDLE':
      case 'UP':
        if (avgElbow > 155) { this.state = 'UP'; this.confirmBuffer = 0 }
        else if (avgElbow < 90) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) { this.state = 'DOWN'; this.confirmBuffer = 0 }
        } else { this.confirmBuffer = 0 }
        break
      case 'DOWN':
        if (avgElbow > 155) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) { this.repCount++; this.state = 'UP'; this.confirmBuffer = 0 }
        } else { this.confirmBuffer = 0 }
        break
      case 'RISING':
        if (avgElbow > 155) { this.repCount++; this.state = 'UP'; this.confirmBuffer = 0 }
        break
    }
    return { repCount: this.repCount, state: this.state }
  }
}

export const PUSHUP_STATE_LABELS: Record<PushupState, string> = {
  IDLE: 'Pregătire...', UP: 'Sus ↑', DOWN: 'Jos ✓', RISING: 'Ridicare',
}

// ── Squat Counter ─────────────────────────────────────────────────────────────
// UP: knee angle > 160°  DOWN: knee angle < 100°

export type SquatState = 'IDLE' | 'UP' | 'DOWN'

export class SquatCounter {
  private repCount = 0
  private state: SquatState = 'IDLE'
  private confirmBuffer = 0

  reset() { this.repCount = 0; this.state = 'IDLE'; this.confirmBuffer = 0 }

  update(avgKnee: number): { repCount: number; state: SquatState } {
    if (!isFinite(avgKnee)) return { repCount: this.repCount, state: this.state }
    switch (this.state) {
      case 'IDLE':
      case 'UP':
        if (avgKnee > 160) { this.state = 'UP'; this.confirmBuffer = 0 }
        else if (avgKnee < 100) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) { this.state = 'DOWN'; this.confirmBuffer = 0 }
        } else { this.confirmBuffer = 0 }
        break
      case 'DOWN':
        if (avgKnee > 160) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) { this.repCount++; this.state = 'UP'; this.confirmBuffer = 0 }
        } else { this.confirmBuffer = 0 }
        break
    }
    return { repCount: this.repCount, state: this.state }
  }
}

export const SQUAT_STATE_LABELS: Record<SquatState, string> = {
  IDLE: 'Pregătire...', UP: 'Sus ↑', DOWN: 'Jos ✓',
}
