/**
 * Pull-up rep counter — port of RepetitionCounter.kt
 */

import type { BodyRiseMetrics } from './pose-math'

const CONFIRM_FRAMES = 3
const MIN_REP_FRAMES = 20
const FIRST_REP_MIN_MS = 1800
const SUBSEQUENT_REP_MIN_MS = 700
const MAX_STATE_FRAMES = 300 // ~10s at 30fps — reset if stuck in PULLING/PEAK/LOWERING

// ── Threshold config types & presets ─────────────────────────────────────────

export interface PullupThresholds {
  /** Elbow angle ABOVE this → enter HANGING state (arms extended, ~150-160°) */
  hangEnter: number
  /** Elbow angle BELOW this → leave HANGING / start pulling (must be < hangEnter for hysteresis) */
  hangExit: number
  /** Elbow angle BELOW this → rep peak reached (arms fully bent, ~75-100°) */
  peak: number
  /** Minimum highAngle−lowestAngle to count a rep (default 25) */
  minRangeRequired?: number
  /** Minimum ms for the first rep (default 1800) */
  firstRepMinMs?: number
  /** Minimum ms for subsequent reps (default 700) */
  subsequentRepMinMs?: number
  /** Minimum frames between reps (default 20) */
  minRepFrames?: number
  /** Minimum normalized shoulder rise (fraction of torso height) to count a rep (default 0.25) */
  minBodyRise?: number
  /** Minimum normalized hip rise (fraction of torso height) to count a rep (default 0.15) */
  minHipRise?: number
}

export interface PushupThresholds {
  /** Elbow angle BELOW this → bottom of rep */
  downAngle: number
  /** Elbow angle ABOVE this → top of rep */
  upAngle: number
  /** Minimum highAngle−lowestAngle to count a rep (default 25) */
  minRangeRequired?: number
  /** Minimum ms for the first rep (default 1800) */
  firstRepMinMs?: number
  /** Minimum ms for subsequent reps (default 700) */
  subsequentRepMinMs?: number
  /** Minimum frames between reps (default 20) */
  minRepFrames?: number
}

export interface SquatThresholds {
  /** Knee angle BELOW this → bottom of squat */
  downAngle: number
  /** Knee angle ABOVE this → standing */
  upAngle: number
  /** Minimum ms for the first rep (default 1800) */
  firstRepMinMs?: number
  /** Minimum ms for subsequent reps (default 700) */
  subsequentRepMinMs?: number
}

export const STRICT_PULLUP:   PullupThresholds = { hangEnter: 150, hangExit: 142, peak: 80, minRangeRequired: 40, firstRepMinMs: 1500, subsequentRepMinMs: 700, minBodyRise: 0.28, minHipRise: 0.18 }
export const BALANCED_PULLUP: PullupThresholds = { hangEnter: 140, hangExit: 135, peak: 95, minRangeRequired: 30, firstRepMinMs: 1000, subsequentRepMinMs: 600, minBodyRise: 0.18, minHipRise: 0.10 }
export const EASY_PULLUP:     PullupThresholds = { hangEnter: 135, hangExit: 128, peak: 105, minRangeRequired: 22, firstRepMinMs: 800, subsequentRepMinMs: 500, minBodyRise: 0.10, minHipRise: 0.05 }

export const STRICT_PUSHUP:   PushupThresholds = { downAngle: 95,  upAngle: 155 }
export const BALANCED_PUSHUP: PushupThresholds = { downAngle: 105, upAngle: 130 }
export const EASY_PUSHUP:     PushupThresholds = { downAngle: 115, upAngle: 125, minRangeRequired: 12, firstRepMinMs: 500, subsequentRepMinMs: 300, minRepFrames: 10 }
export const PUSHUP_THRESHOLDS: PushupThresholds = BALANCED_PUSHUP

export const STRICT_SQUAT:   SquatThresholds = { downAngle: 90,  upAngle: 155, firstRepMinMs: 1200 }
export const BALANCED_SQUAT: SquatThresholds = { downAngle: 100, upAngle: 150, firstRepMinMs: 1000, subsequentRepMinMs: 500 }
export const EASY_SQUAT:     SquatThresholds = { downAngle: 110, upAngle: 145, firstRepMinMs: 800,  subsequentRepMinMs: 400 }

// ── Pull-up Counter ───────────────────────────────────────────────────────────

export type RepState = 'IDLE' | 'HANGING' | 'PULLING' | 'PEAK' | 'LOWERING'

export interface RepCounterState {
  repCount: number
  state: RepState
  /** Current average elbow angle */
  currentAngle: number
  /** Frames since last completed rep */
  framesSinceRep: number
  /** Estimated bar Y position (wrist Y when hanging), or null if not yet established */
  barY: number | null
  /** Whether the last potential rep was rejected due to insufficient body rise */
  bodyRiseRejected: boolean
}

export class RepCounter {
  private repCount = 0
  private state: RepState = 'IDLE'
  private confirmBuffer = 0
  private framesSinceRep = 0
  private peakReached = false
  private t: PullupThresholds
  private highAngle: number | null = null
  private lowestAngle: number | null = null
  private minRangeRequired: number
  private firstRepMinMs: number
  private subsequentRepMinMs: number
  private minRepFrames: number
  private repStartMs: number | null = null
  private readonly enforceTiming: boolean

  // Body rise tracking
  private minBodyRise: number
  private minHipRise: number
  private hangShoulderY: number | null = null
  private hangHipY: number | null = null
  private bestShoulderY: number | null = null
  private bestHipY: number | null = null
  private bodyRiseRejected = false

  // Bar detection
  private barYSamples: number[] = []
  private barY: number | null = null

  // Abort buffer — separate from confirmBuffer to guard PULLING→HANGING fallback
  private abortBuffer = 0

  // Timeout recovery — prevents state machine from getting permanently stuck
  private stateFrameCount = 0

  constructor(thresholds: PullupThresholds = BALANCED_PULLUP, enforceTiming = true) {
    this.t = thresholds
    this.minRangeRequired = thresholds.minRangeRequired ?? 25
    this.firstRepMinMs = thresholds.firstRepMinMs ?? FIRST_REP_MIN_MS
    this.subsequentRepMinMs = thresholds.subsequentRepMinMs ?? SUBSEQUENT_REP_MIN_MS
    this.minRepFrames = thresholds.minRepFrames ?? MIN_REP_FRAMES
    this.minBodyRise = thresholds.minBodyRise ?? 0.25
    this.minHipRise = thresholds.minHipRise ?? 0.15
    this.enforceTiming = enforceTiming
  }

  /** Swap thresholds at runtime (e.g. easy/balanced/strict toggle). Preserves rep count. */
  setThresholds(t: PullupThresholds) {
    this.t = t
    this.minRangeRequired = t.minRangeRequired ?? 25
    this.firstRepMinMs = t.firstRepMinMs ?? FIRST_REP_MIN_MS
    this.subsequentRepMinMs = t.subsequentRepMinMs ?? SUBSEQUENT_REP_MIN_MS
    this.minRepFrames = t.minRepFrames ?? MIN_REP_FRAMES
    this.minBodyRise = t.minBodyRise ?? 0.25
    this.minHipRise = t.minHipRise ?? 0.15
  }

  reset() {
    this.repCount = 0
    this.softReset()
  }

  /** Reset state machine but preserve rep count. Use when switching exercises in unified mode. */
  softReset() {
    this.state = 'IDLE'
    this.confirmBuffer = 0
    this.framesSinceRep = 0
    this.peakReached = false
    this.highAngle = null
    this.lowestAngle = null
    this.repStartMs = null
    this.hangShoulderY = null
    this.hangHipY = null
    this.bestShoulderY = null
    this.bestHipY = null
    this.bodyRiseRejected = false
    this.barYSamples = []
    this.barY = null
    this.abortBuffer = 0
    this.stateFrameCount = 0
  }

  private snapshot(): RepCounterState {
    return {
      repCount: this.repCount, state: this.state, currentAngle: NaN,
      framesSinceRep: this.framesSinceRep, barY: this.barY, bodyRiseRejected: this.bodyRiseRejected,
    }
  }

  update(avgElbow: number, bodyMetrics?: BodyRiseMetrics | null): RepCounterState {
    if (!isFinite(avgElbow)) return this.snapshot()
    this.framesSinceRep++

    // Timeout recovery — if stuck in PULLING/PEAK/LOWERING for too long, reset
    if (this.state === 'PULLING' || this.state === 'PEAK' || this.state === 'LOWERING') {
      this.stateFrameCount++
      if (this.stateFrameCount > MAX_STATE_FRAMES) {
        this.state = 'IDLE'
        this.confirmBuffer = 0
        this.abortBuffer = 0
        this.stateFrameCount = 0
        this.peakReached = false
        this.lowestAngle = null
        this.repStartMs = null
        this.bestShoulderY = null
        this.bestHipY = null
        return this.snapshot()
      }
    }

    switch (this.state) {
      case 'IDLE':
      case 'HANGING': {
        if (avgElbow >= this.t.hangEnter) {
          this.confirmBuffer++
          // Track highest angle while hanging (used as range start like PushupCounter)
          if (this.highAngle === null || avgElbow > this.highAngle) this.highAngle = avgElbow
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.peakReached = false
            this.bodyRiseRejected = false
            // Capture body baseline for rise tracking
            if (bodyMetrics) {
              this.hangShoulderY = bodyMetrics.shoulderMidY
              this.hangHipY = bodyMetrics.hipMidY
              this.bestShoulderY = null
              this.bestHipY = null
            }
          }
        } else if (this.state === 'HANGING' && avgElbow < this.t.hangExit) {
          // Arms bent enough — started pulling up
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'PULLING'
            this.confirmBuffer = 0
            this.stateFrameCount = 0
            this.lowestAngle = avgElbow
            this.repStartMs = performance.now()
          }
        } else {
          this.confirmBuffer = 0
          // Stay in current state — do NOT auto-transition IDLE→HANGING
          // HANGING is only entered when arms are extended (avgElbow >= hangEnter)
        }

        // While in HANGING, keep updating baseline and bar position
        if (this.state === 'HANGING' && bodyMetrics) {
          this.hangShoulderY = bodyMetrics.shoulderMidY
          this.hangHipY = bodyMetrics.hipMidY
          this.barYSamples.push(bodyMetrics.wristMidY)
          if (this.barYSamples.length > 10) this.barYSamples.shift()
          this.barY = this.barYSamples.reduce((a, b) => a + b, 0) / this.barYSamples.length
        }
        break
      }

      case 'PULLING': {
        // Track body rise during pull
        if (bodyMetrics) {
          if (this.bestShoulderY === null || bodyMetrics.shoulderMidY < this.bestShoulderY) {
            this.bestShoulderY = bodyMetrics.shoulderMidY
          }
          if (this.bestHipY === null || bodyMetrics.hipMidY < this.bestHipY) {
            this.bestHipY = bodyMetrics.hipMidY
          }
        }

        if (avgElbow <= this.t.peak) {
          this.confirmBuffer++
          this.abortBuffer = 0
          // Track deepest angle even while confirming peak
          if (this.lowestAngle === null || avgElbow < this.lowestAngle) this.lowestAngle = avgElbow
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'PEAK'
            this.peakReached = true
            this.confirmBuffer = 0
            this.stateFrameCount = 0
          }
        } else if (avgElbow >= this.t.hangEnter) {
          // Dropping back without reaching peak — require CONFIRM_FRAMES to avoid noise resets
          this.abortBuffer++
          this.confirmBuffer = 0
          if (this.abortBuffer >= CONFIRM_FRAMES) {
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.abortBuffer = 0
            this.stateFrameCount = 0
            this.lowestAngle = null
            this.repStartMs = null
          }
        } else {
          this.confirmBuffer = 0
          this.abortBuffer = 0
          // Track deepest point reached during pull
          if (this.lowestAngle === null || avgElbow < this.lowestAngle) this.lowestAngle = avgElbow
        }
        break
      }

      case 'PEAK': {
        // Track deepest angle during peak hold
        if (this.lowestAngle === null || avgElbow < this.lowestAngle) this.lowestAngle = avgElbow

        // Track body rise during peak hold
        if (bodyMetrics) {
          if (this.bestShoulderY === null || bodyMetrics.shoulderMidY < this.bestShoulderY) {
            this.bestShoulderY = bodyMetrics.shoulderMidY
          }
          if (this.bestHipY === null || bodyMetrics.hipMidY < this.bestHipY) {
            this.bestHipY = bodyMetrics.hipMidY
          }
        }

        if (avgElbow > this.t.peak) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'LOWERING'
            this.confirmBuffer = 0
            this.stateFrameCount = 0
          }
        } else {
          this.confirmBuffer = 0
        }
        break
      }

      case 'LOWERING': {
        if (avgElbow >= this.t.hangEnter && this.peakReached) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES && this.framesSinceRep >= this.minRepFrames) {
            const rangeOk = this.highAngle !== null && this.lowestAngle !== null
              && (this.highAngle - this.lowestAngle) >= this.minRangeRequired
            let timeOk = true
            if (this.enforceTiming) {
              const minMs = this.repCount === 0 ? this.firstRepMinMs : this.subsequentRepMinMs
              const elapsed = this.repStartMs !== null ? performance.now() - this.repStartMs : Infinity
              timeOk = elapsed >= minMs
            }

            // Body rise check — shoulders and hips must have risen
            let bodyRiseOk = true
            if (this.minBodyRise > 0 && this.hangShoulderY !== null && this.bestShoulderY !== null) {
              const torsoH = bodyMetrics?.torsoHeight ?? 0.15
              if (torsoH > 0.01) {
                const shoulderRise = (this.hangShoulderY - this.bestShoulderY) / torsoH
                const hipRise = (this.hangHipY !== null && this.bestHipY !== null)
                  ? (this.hangHipY - this.bestHipY) / torsoH
                  : shoulderRise
                bodyRiseOk = shoulderRise >= this.minBodyRise && hipRise >= this.minHipRise
              }
            }
            this.bodyRiseRejected = rangeOk && timeOk && !bodyRiseOk

            if (rangeOk && timeOk && bodyRiseOk) this.repCount++
            this.state = 'HANGING'
            this.confirmBuffer = 0
            this.stateFrameCount = 0
            this.framesSinceRep = 0
            this.peakReached = false
            this.highAngle = avgElbow
            this.lowestAngle = null
            this.repStartMs = null
            // Reset body rise for next rep
            if (bodyMetrics) {
              this.hangShoulderY = bodyMetrics.shoulderMidY
              this.hangHipY = bodyMetrics.hipMidY
            }
            this.bestShoulderY = null
            this.bestHipY = null
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
      barY: this.barY,
      bodyRiseRejected: this.bodyRiseRejected,
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
  private framesSinceRep = 0
  private t: PushupThresholds
  private highAngle: number | null = null
  private lowestAngle: number | null = null
  private minRangeRequired: number
  private firstRepMinMs: number
  private subsequentRepMinMs: number
  private minRepFrames: number
  private repStartMs: number | null = null
  private readonly enforceTiming: boolean

  constructor(thresholds: PushupThresholds = PUSHUP_THRESHOLDS, enforceTiming = true) {
    this.t = thresholds
    this.minRangeRequired = thresholds.minRangeRequired ?? 25
    this.firstRepMinMs = thresholds.firstRepMinMs ?? FIRST_REP_MIN_MS
    this.subsequentRepMinMs = thresholds.subsequentRepMinMs ?? SUBSEQUENT_REP_MIN_MS
    this.minRepFrames = thresholds.minRepFrames ?? MIN_REP_FRAMES
    this.enforceTiming = enforceTiming
  }

  /** Swap thresholds at runtime (e.g. easy/strict toggle). Preserves rep count. */
  setThresholds(t: PushupThresholds) {
    this.t = t
    this.minRangeRequired = t.minRangeRequired ?? 25
    this.firstRepMinMs = t.firstRepMinMs ?? FIRST_REP_MIN_MS
    this.subsequentRepMinMs = t.subsequentRepMinMs ?? SUBSEQUENT_REP_MIN_MS
    this.minRepFrames = t.minRepFrames ?? MIN_REP_FRAMES
  }

  reset() {
    this.repCount = 0
    this.softReset()
  }

  /** Reset state machine but preserve rep count. Use when switching exercises in unified mode. */
  softReset() {
    this.state = 'IDLE'; this.confirmBuffer = 0
    this.framesSinceRep = 0
    this.highAngle = null; this.lowestAngle = null
    this.repStartMs = null
  }

  update(avgElbow: number): { repCount: number; state: PushupState } {
    if (!isFinite(avgElbow)) return { repCount: this.repCount, state: this.state }
    this.framesSinceRep++
    switch (this.state) {
      case 'IDLE':
      case 'UP':
        // Track highest angle while in UP position — used as range start
        if (avgElbow > this.t.upAngle) {
          this.state = 'UP'; this.confirmBuffer = 0
          if (this.highAngle === null || avgElbow > this.highAngle) this.highAngle = avgElbow
        }
        else if (avgElbow < this.t.downAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'DOWN'
            this.confirmBuffer = 0
            this.lowestAngle = avgElbow
            this.repStartMs = performance.now()
          }
        } else { this.confirmBuffer = 0 }
        break
      case 'DOWN':
        // Track deepest point
        if (this.lowestAngle === null || avgElbow < this.lowestAngle) this.lowestAngle = avgElbow
        if (avgElbow > this.t.upAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES && this.framesSinceRep >= this.minRepFrames) {
            const rangeOk = this.highAngle !== null && this.lowestAngle !== null
              && (this.highAngle - this.lowestAngle) >= this.minRangeRequired
            let timeOk = true
            if (this.enforceTiming) {
              const minMs = this.repCount === 0 ? this.firstRepMinMs : this.subsequentRepMinMs
              const elapsed = this.repStartMs !== null ? performance.now() - this.repStartMs : Infinity
              timeOk = elapsed >= minMs
            }
            if (rangeOk && timeOk) this.repCount++
            this.state = 'UP'; this.confirmBuffer = 0
            this.framesSinceRep = 0
            this.highAngle = avgElbow; this.lowestAngle = null
            this.repStartMs = null
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
  private framesSinceRep = 0
  private t: SquatThresholds
  private highAngle: number | null = null
  private lowestAngle: number | null = null
  private readonly minRangeRequired = 20
  private repStartMs: number | null = null
  private readonly enforceTiming: boolean
  private firstRepMinMs: number
  private subsequentRepMinMs: number

  constructor(thresholds: SquatThresholds = STRICT_SQUAT, enforceTiming = true) {
    this.t = thresholds
    this.enforceTiming = enforceTiming
    this.firstRepMinMs = thresholds.firstRepMinMs ?? FIRST_REP_MIN_MS
    this.subsequentRepMinMs = thresholds.subsequentRepMinMs ?? SUBSEQUENT_REP_MIN_MS
  }

  reset() {
    this.repCount = 0
    this.softReset()
  }

  /** Reset state machine but preserve rep count. Use when switching exercises in unified mode. */
  softReset() {
    this.state = 'IDLE'; this.confirmBuffer = 0
    this.framesSinceRep = 0
    this.highAngle = null; this.lowestAngle = null
    this.repStartMs = null
  }

  update(avgKnee: number): { repCount: number; state: SquatState } {
    if (!isFinite(avgKnee)) return { repCount: this.repCount, state: this.state }
    this.framesSinceRep++
    switch (this.state) {
      case 'IDLE':
      case 'UP':
        // Always track highest angle while standing — used as range start
        if (this.highAngle === null || avgKnee > this.highAngle) this.highAngle = avgKnee
        if (avgKnee > this.t.upAngle) {
          this.state = 'UP'; this.confirmBuffer = 0
        }
        else if (avgKnee < this.t.downAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES) {
            this.state = 'DOWN'
            this.confirmBuffer = 0
            this.lowestAngle = avgKnee
            this.repStartMs = performance.now()
          }
        } else { this.confirmBuffer = 0 }
        break
      case 'DOWN':
        // Track deepest bend
        if (this.lowestAngle === null || avgKnee < this.lowestAngle) this.lowestAngle = avgKnee
        if (avgKnee > this.t.upAngle) {
          this.confirmBuffer++
          if (this.confirmBuffer >= CONFIRM_FRAMES && this.framesSinceRep >= MIN_REP_FRAMES) {
            const rangeOk = this.highAngle !== null && this.lowestAngle !== null
              && (this.highAngle - this.lowestAngle) >= this.minRangeRequired
            let timeOk = true
            if (this.enforceTiming) {
              const minMs = this.repCount === 0 ? this.firstRepMinMs : this.subsequentRepMinMs
              const elapsed = this.repStartMs !== null ? performance.now() - this.repStartMs : Infinity
              timeOk = elapsed >= minMs
            }
            if (rangeOk && timeOk) this.repCount++
            this.state = 'UP'; this.confirmBuffer = 0
            this.framesSinceRep = 0
            this.highAngle = avgKnee; this.lowestAngle = null
            this.repStartMs = null
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

// ── Pistol Squat Counter ─────────────────────────────────────────────────────

export interface PistolSquatState {
  repCount: number
  leftReps: number
  rightReps: number
  activeLeg: 'left' | 'right' | null
  state: SquatState
}

export class PistolSquatCounter {
  private inner: SquatCounter
  private leftReps = 0
  private rightReps = 0
  private activeLeg: 'left' | 'right' | null = null
  private lastInnerCount = 0

  /** Minimum ankle Y difference (normalized coords) to detect a raised leg */
  private static readonly ANKLE_ASYMMETRY = 0.08

  constructor(thresholds: SquatThresholds = BALANCED_SQUAT, enforceTiming = true) {
    this.inner = new SquatCounter(thresholds, enforceTiming)
  }

  reset() {
    this.inner.reset()
    this.leftReps = 0
    this.rightReps = 0
    this.activeLeg = null
    this.lastInnerCount = 0
  }

  update(
    leftKneeAngle: number, rightKneeAngle: number,
    leftAnkleY: number, rightAnkleY: number,
  ): PistolSquatState {
    // Determine which leg is on the ground (higher Y = lower in frame = on the floor)
    const asymmetry = Math.abs(leftAnkleY - rightAnkleY)
    if (asymmetry >= PistolSquatCounter.ANKLE_ASYMMETRY) {
      this.activeLeg = leftAnkleY > rightAnkleY ? 'left' : 'right'
    }

    // Feed the grounded leg's knee angle to the squat state machine
    const angle = this.activeLeg === 'left' ? leftKneeAngle
      : this.activeLeg === 'right' ? rightKneeAngle
      : Math.min(leftKneeAngle, rightKneeAngle)

    const result = this.inner.update(angle)

    // Attribute new reps to the active leg
    if (result.repCount > this.lastInnerCount && this.activeLeg) {
      if (this.activeLeg === 'left') this.leftReps++
      else this.rightReps++
    }
    this.lastInnerCount = result.repCount

    return {
      repCount: result.repCount,
      leftReps: this.leftReps,
      rightReps: this.rightReps,
      activeLeg: this.activeLeg,
      state: result.state,
    }
  }
}
