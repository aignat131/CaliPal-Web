/**
 * Pull-up rep counter — port of RepetitionCounter.kt
 */

const CONFIRM_FRAMES = 2
const MIN_REP_FRAMES = 20

// ── Threshold config types & presets ─────────────────────────────────────────

export interface PullupThresholds {
  /** Elbow angle ABOVE this → enter HANGING state */
  hangEnter: number
  /** Must drop BELOW this to leave HANGING (start pulling) */
  hangExit: number
  /** Elbow angle BELOW this → rep peak reached */
  peak: number
}

export interface PushupThresholds {
  /** Elbow angle BELOW this → bottom of rep */
  downAngle: number
  /** Elbow angle ABOVE this → top of rep */
  upAngle: number
}

export interface SquatThresholds {
  /** Knee angle BELOW this → bottom of squat */
  downAngle: number
  /** Knee angle ABOVE this → standing */
  upAngle: number
}

export const STRICT_PULLUP:   PullupThresholds = { hangEnter: 148, hangExit: 153, peak: 105 }
export const BALANCED_PULLUP: PullupThresholds = { hangEnter: 144, hangExit: 149, peak: 112 }
export const EASY_PULLUP:     PullupThresholds = { hangEnter: 140, hangExit: 145, peak: 120 }

export const STRICT_PUSHUP:   PushupThresholds = { downAngle: 90,  upAngle: 155 }
export const BALANCED_PUSHUP: PushupThresholds = { downAngle: 105, upAngle: 145 }
export const EASY_PUSHUP:     PushupThresholds = { downAngle: 115, upAngle: 140 }

export const STRICT_SQUAT:   SquatThresholds = { downAngle: 100, upAngle: 160 }
export const BALANCED_SQUAT: SquatThresholds = { downAngle: 110, upAngle: 150 }
export const EASY_SQUAT:     SquatThresholds = { downAngle: 115, upAngle: 145 }

// ── Pull-up Counter ───────────────────────────────────────────────────────────

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
  private t: PullupThresholds
  private startAngle: number | null = null
  private lowestAngle: number | null = null
  private readonly minRangeRequired = 25

  constructor(thresholds: PullupThresholds = STRICT_PULLUP) {
    this.t = thresholds
  }

  reset() {
    this.repCount = 0
    this.state = 'IDLE'
    this.confirmBuffer = 0
    this.framesSinceRep = 0
    this.peakReached = false
    this.startAngle = null
    this.lowestAngle = null
  }

  private snapshot(): RepCounterState {
    return { repCount: this.repCount, state: this.state, currentAngle: NaN, framesSinceRep: this.framesSinceRep }
  }

  update(avgElbow: number): RepCounterState {
    if (!isFinite(avgElbow)) return this.snapshot()
    this.framesSinceRep++

    switch (this.state) {
      case 'IDLE':
      case 'HANGING': {
        if (avgElbow >= this.t.hangEnter) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.peakReached = false
          }
        } else if (this.state === 'HANGING' && avgElbow < this.t.hangExit) {
          // Started pulling up
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'PULLING'
            this.confirmBuffer = 0
            this.startAngle = avgElbow
            this.lowestAngle = avgElbow
          }
        } else {
          this.confirmBuffer = 0
          if (this.state === 'IDLE') this.state = 'HANGING'
        }
        break
      }

      case 'PULLING': {
        if (avgElbow <= this.t.peak) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'PEAK'
            this.peakReached = true
            this.confirmBuffer = 0
          }
        } else if (avgElbow >= this.t.hangEnter) {
          // Dropped back without reaching peak — not a full rep
          this.state = 'HANGING'
          this.confirmBuffer = 0
          this.startAngle = null
          this.lowestAngle = null
        } else {
          this.confirmBuffer = 0
          // Track deepest point reached during pull
          if (this.lowestAngle === null || avgElbow < this.lowestAngle) this.lowestAngle = avgElbow
        }
        break
      }

      case 'PEAK': {
        if (avgElbow > this.t.peak) {
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
        if (avgElbow >= this.t.hangEnter && this.peakReached) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES && this.framesSinceRep >= MIN_REP_FRAMES) {
            const rangeOk = this.startAngle !== null && this.lowestAngle !== null
              && (this.startAngle - this.lowestAngle) >= this.minRangeRequired
            if (rangeOk) this.repCount++
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.framesSinceRep = 0
            this.peakReached = false
            this.startAngle = null
            this.lowestAngle = null
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

export type PushupState = 'IDLE' | 'UP' | 'DOWN' | 'RISING'

export class PushupCounter {
  private repCount = 0
  private state: PushupState = 'IDLE'
  private confirmBuffer = 0
  private t: PushupThresholds
  private startAngle: number | null = null
  private lowestAngle: number | null = null
  private readonly minRangeRequired = 30

  constructor(thresholds: PushupThresholds = STRICT_PUSHUP) {
    this.t = thresholds
  }

  reset() {
    this.repCount = 0; this.state = 'IDLE'; this.confirmBuffer = 0
    this.startAngle = null; this.lowestAngle = null
  }

  update(avgElbow: number): { repCount: number; state: PushupState } {
    if (!isFinite(avgElbow)) return { repCount: this.repCount, state: this.state }
    switch (this.state) {
      case 'IDLE':
      case 'UP':
        if (avgElbow > this.t.upAngle) { this.state = 'UP'; this.confirmBuffer = 0 }
        else if (avgElbow < this.t.downAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) {
            this.state = 'DOWN'
            this.confirmBuffer = 0
            this.startAngle = avgElbow
            this.lowestAngle = avgElbow
          }
        } else { this.confirmBuffer = 0 }
        break
      case 'DOWN':
        // Track deepest point
        if (this.lowestAngle === null || avgElbow < this.lowestAngle) this.lowestAngle = avgElbow
        if (avgElbow > this.t.upAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) {
            const rangeOk = this.startAngle !== null && this.lowestAngle !== null
              && (this.startAngle - this.lowestAngle) >= this.minRangeRequired
            if (rangeOk) this.repCount++
            this.state = 'UP'; this.confirmBuffer = 0
            this.startAngle = null; this.lowestAngle = null
          }
        } else { this.confirmBuffer = 0 }
        break
      case 'RISING':
        if (avgElbow > this.t.upAngle) { this.repCount++; this.state = 'UP'; this.confirmBuffer = 0 }
        break
    }
    return { repCount: this.repCount, state: this.state }
  }
}

export const PUSHUP_STATE_LABELS: Record<PushupState, string> = {
  IDLE: 'Pregătire...', UP: 'Sus ↑', DOWN: 'Jos ✓', RISING: 'Ridicare',
}

// ── Squat Counter ─────────────────────────────────────────────────────────────

export type SquatState = 'IDLE' | 'UP' | 'DOWN'

export class SquatCounter {
  private repCount = 0
  private state: SquatState = 'IDLE'
  private confirmBuffer = 0
  private t: SquatThresholds
  private startAngle: number | null = null
  private lowestAngle: number | null = null
  private readonly minRangeRequired = 30

  constructor(thresholds: SquatThresholds = STRICT_SQUAT) {
    this.t = thresholds
  }

  reset() {
    this.repCount = 0; this.state = 'IDLE'; this.confirmBuffer = 0
    this.startAngle = null; this.lowestAngle = null
  }

  update(avgKnee: number): { repCount: number; state: SquatState } {
    if (!isFinite(avgKnee)) return { repCount: this.repCount, state: this.state }
    switch (this.state) {
      case 'IDLE':
      case 'UP':
        if (avgKnee > this.t.upAngle) { this.state = 'UP'; this.confirmBuffer = 0 }
        else if (avgKnee < this.t.downAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) {
            this.state = 'DOWN'
            this.confirmBuffer = 0
            this.startAngle = avgKnee
            this.lowestAngle = avgKnee
          }
        } else { this.confirmBuffer = 0 }
        break
      case 'DOWN':
        // Track deepest bend
        if (this.lowestAngle === null || avgKnee < this.lowestAngle) this.lowestAngle = avgKnee
        if (avgKnee > this.t.upAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= 2) {
            const rangeOk = this.startAngle !== null && this.lowestAngle !== null
              && (this.startAngle - this.lowestAngle) >= this.minRangeRequired
            if (rangeOk) this.repCount++
            this.state = 'UP'; this.confirmBuffer = 0
            this.startAngle = null; this.lowestAngle = null
          }
        } else { this.confirmBuffer = 0 }
        break
    }
    return { repCount: this.repCount, state: this.state }
  }
}

export const SQUAT_STATE_LABELS: Record<SquatState, string> = {
  IDLE: 'Pregătire...', UP: 'Sus ↑', DOWN: 'Jos ✓',
}
