/**
 * Static hold detector — rule-based position detection + hold timer.
 *
 * State machine: WAITING → ENTERING → HOLDING → BROKEN → ENTERING (repeat)
 *
 * Each exercise has a `checkPosition()` function that validates the user's pose
 * using MediaPipe landmarks. The detector accumulates consecutive valid/invalid
 * frames to transition between states, preventing noise-triggered flicker.
 */

import { bestElbowAngle, bestKneeAngle, MP } from './pose-math'
import type { Landmark } from './pose-math'

// ── Types ────────────────────────────────────────────────────────────────────

export type HoldExerciseType = 'dead_hang' | 'l_sit' | 'handstand' | 'front_lever' | 'planche'

export type HoldState = 'WAITING' | 'ENTERING' | 'HOLDING' | 'BROKEN'

export interface PositionCheck {
  valid: boolean
  /** 0-1 quality score for current frame */
  score: number
  /** Short form cue messages for this frame */
  cues: string[]
}

export interface HoldSnapshot {
  state: HoldState
  /** Cumulative hold time across all segments (ms) */
  totalHoldMs: number
  /** Current unbroken segment duration (ms) */
  currentSegmentMs: number
  /** Longest single unbroken segment (ms) */
  bestSegmentMs: number
  /** Number of hold segments completed or in progress */
  holdCount: number
  /** 0-1 position quality score for this frame */
  positionScore: number
  /** Form cue messages for this frame */
  cues: string[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const ENTER_THRESHOLD = 5   // consecutive valid frames to confirm entry (~0.17s at 30fps)
const BREAK_THRESHOLD = 8   // consecutive invalid frames to break hold (~0.27s)
const BREAK_GRACE_MS = 3000 // after break, 3s to re-enter before resetting segment

// ── Exercise metadata ────────────────────────────────────────────────────────

export interface HoldExerciseMeta {
  name: string
  emoji: string
  color: string
  description: string
}

export const HOLD_EXERCISES: Record<HoldExerciseType, HoldExerciseMeta> = {
  dead_hang:    { name: 'Dead Hang',    emoji: '💀', color: '#3B82F6', description: 'Atârnă de bară, brațe extinse' },
  l_sit:        { name: 'L-Sit',        emoji: '🪑', color: '#F59E0B', description: 'Sprijin pe mâini, picioare orizontale' },
  handstand:    { name: 'Handstand',    emoji: '🤸', color: '#8B5CF6', description: 'Stai pe mâini, corp vertical' },
  front_lever:  { name: 'Front Lever',  emoji: '🏗️', color: '#EF4444', description: 'Atârnă de bară, corp orizontal' },
  planche:      { name: 'Planche',      emoji: '🦅', color: '#06B6D4', description: 'Echilibru pe mâini, corp orizontal' },
}

// ── State labels ─────────────────────────────────────────────────────────────

export const HOLD_STATE_LABELS: Record<HoldState, string> = {
  WAITING:  'Pregătire...',
  ENTERING: 'Menține...',
  HOLDING:  'Ține! ✓',
  BROKEN:   'Poziție pierdută',
}

export const HOLD_STATE_COLORS: Record<HoldState, string> = {
  WAITING:  '#6B7280',
  ENTERING: '#F59E0B',
  HOLDING:  '#1ED75F',
  BROKEN:   '#EF4444',
}

// ── Position check helpers ───────────────────────────────────────────────────

/** Midpoint helpers — MediaPipe Y: 0 = top of frame, 1 = bottom */
function midY(a: Landmark, b: Landmark): number { return (a.y + b.y) / 2 }
function midX(a: Landmark, b: Landmark): number { return (a.x + b.x) / 2 }

function checkDeadHang(lms: Landmark[]): PositionCheck {
  const cues: string[] = []
  let score = 1

  const shoulderY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const wristY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])
  const hipY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])

  // Wrists above shoulders (lower Y = higher in frame)
  const wristsAbove = wristY < shoulderY - 0.02
  if (!wristsAbove) { cues.push('Ridică mâinile deasupra umerilor'); score -= 0.4 }

  // Arms extended
  const elbow = bestElbowAngle(
    lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
    lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST],
  )
  if (elbow < 130) { cues.push('Extinde brațele complet'); score -= 0.3 }
  else if (elbow < 150) { score -= 0.1 }

  // Hips below shoulders (body hanging)
  const bodyVertical = hipY > shoulderY + 0.05
  if (!bodyVertical) { cues.push('Lasă corpul să atârne'); score -= 0.3 }

  const valid = wristsAbove && elbow >= 130 && bodyVertical
  return { valid, score: Math.max(0, score), cues }
}

function checkLSit(lms: Landmark[]): PositionCheck {
  const cues: string[] = []
  let score = 1

  const shoulderY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const wristY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])
  const ankleY = midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE])

  // Shoulders above hips
  const shouldersAbove = shoulderY < hipY - 0.02
  if (!shouldersAbove) { cues.push('Menține umerii deasupra șoldurilor'); score -= 0.3 }

  // Wrists near hip level (hands supporting body)
  const wristsNearHips = wristY >= hipY - 0.10
  if (!wristsNearHips) { cues.push('Mâinile la nivelul șoldurilor'); score -= 0.3 }

  // Legs straight (knee angle > 145°)
  const knee = bestKneeAngle(
    lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
    lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE],
  )
  if (knee < 130) { cues.push('Întinde picioarele'); score -= 0.4 }
  else if (knee < 155) { score -= 0.15 }

  // Legs elevated — ankles at or above hip level (ankleY <= hipY + tolerance)
  const legsUp = ankleY <= hipY + 0.08
  if (!legsUp) { cues.push('Ridică picioarele mai sus'); score -= 0.3 }

  const valid = shouldersAbove && wristsNearHips && knee >= 130 && legsUp
  return { valid, score: Math.max(0, score), cues }
}

function checkHandstand(lms: Landmark[]): PositionCheck {
  const cues: string[] = []
  let score = 1

  const shoulderY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const wristY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])

  // Body inverted: wrists lowest (highest Y), then shoulders, then hips (lowest Y = top)
  // In MediaPipe coords: wristY > shoulderY > hipY means wrists at bottom, hips at top
  const inverted = wristY > shoulderY && shoulderY > hipY
  if (!inverted) { cues.push('Inversează corpul — mâinile pe podea'); score -= 0.5 }

  // Arms extended
  const elbow = bestElbowAngle(
    lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
    lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST],
  )
  if (elbow < 145) { cues.push('Întinde brațele complet'); score -= 0.3 }
  else if (elbow < 165) { score -= 0.1 }

  // Body roughly vertical — shoulders and hips have similar X
  const shoulderX = midX(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipX = midX(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const lateralDrift = Math.abs(shoulderX - hipX)
  if (lateralDrift > 0.15) { cues.push('Aliniază corpul vertical'); score -= 0.2 }
  else if (lateralDrift > 0.08) { score -= 0.1 }

  const valid = inverted && elbow >= 145 && lateralDrift <= 0.15
  return { valid, score: Math.max(0, score), cues }
}

function checkFrontLever(lms: Landmark[]): PositionCheck {
  const cues: string[] = []
  let score = 1

  const shoulderY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const ankleY = midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE])
  const wristY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])

  // Hanging: wrists above shoulders
  const hanging = wristY < shoulderY - 0.02
  if (!hanging) { cues.push('Apucă bara — mâinile sus'); score -= 0.4 }

  // Arms extended
  const elbow = bestElbowAngle(
    lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
    lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST],
  )
  if (elbow < 130) { cues.push('Extinde brațele'); score -= 0.3 }
  else if (elbow < 150) { score -= 0.1 }

  // Body horizontal: shoulder, hip, ankle Y values close together
  const shoulderHipDiff = Math.abs(shoulderY - hipY)
  const hipAnkleDiff = Math.abs(hipY - ankleY)
  const horizontal = shoulderHipDiff < 0.15 && hipAnkleDiff < 0.15
  if (!horizontal) {
    if (hipY > shoulderY + 0.15) cues.push('Ridică șoldurile — corp orizontal')
    else if (ankleY > hipY + 0.15) cues.push('Ridică picioarele — corp orizontal')
    score -= 0.3
  }

  const valid = hanging && elbow >= 130 && horizontal
  return { valid, score: Math.max(0, score), cues }
}

function checkPlanche(lms: Landmark[]): PositionCheck {
  const cues: string[] = []
  let score = 1

  const shoulderY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const ankleY = midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE])
  const wristY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])

  // Support position: wrists at or below shoulders (hands on ground)
  // In MediaPipe coords: wristY >= shoulderY means wrists lower in frame (on ground)
  const supported = wristY >= shoulderY - 0.05
  if (!supported) { cues.push('Mâinile pe podea'); score -= 0.4 }

  // Arms extended
  const elbow = bestElbowAngle(
    lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
    lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST],
  )
  if (elbow < 140) { cues.push('Întinde brațele'); score -= 0.3 }
  else if (elbow < 160) { score -= 0.1 }

  // Body horizontal: shoulder, hip, ankle Y values close together
  const shoulderHipDiff = Math.abs(shoulderY - hipY)
  const hipAnkleDiff = Math.abs(hipY - ankleY)
  const horizontal = shoulderHipDiff < 0.15 && hipAnkleDiff < 0.15
  if (!horizontal) {
    if (hipY > shoulderY + 0.15) cues.push('Ridică șoldurile')
    else if (ankleY > hipY + 0.15) cues.push('Ridică picioarele')
    score -= 0.3
  }

  // Body floating: ankles above wrists (not resting on ground)
  const floating = ankleY < wristY - 0.02
  if (!floating) { cues.push('Ridică corpul de pe podea'); score -= 0.3 }

  const valid = supported && elbow >= 140 && horizontal && floating
  return { valid, score: Math.max(0, score), cues }
}

// ── Position check dispatch ──────────────────────────────────────────────────

const POSITION_CHECKS: Record<HoldExerciseType, (lms: Landmark[]) => PositionCheck> = {
  dead_hang: checkDeadHang,
  l_sit: checkLSit,
  handstand: checkHandstand,
  front_lever: checkFrontLever,
  planche: checkPlanche,
}

// ── HoldDetector class ───────────────────────────────────────────────────────

export class HoldDetector {
  private exercise: HoldExerciseType
  private state: HoldState = 'WAITING'
  private confirmBuffer = 0
  private breakBuffer = 0

  // Timing
  private holdStartMs: number | null = null
  private totalHoldMs = 0
  private currentSegmentMs = 0
  private bestSegmentMs = 0
  private holdCount = 0
  private lastBreakMs: number | null = null
  private lastPositionCheck: PositionCheck = { valid: false, score: 0, cues: [] }

  constructor(exercise: HoldExerciseType) {
    this.exercise = exercise
  }

  reset() {
    this.state = 'WAITING'
    this.confirmBuffer = 0
    this.breakBuffer = 0
    this.holdStartMs = null
    this.totalHoldMs = 0
    this.currentSegmentMs = 0
    this.bestSegmentMs = 0
    this.holdCount = 0
    this.lastBreakMs = null
    this.lastPositionCheck = { valid: false, score: 0, cues: [] }
  }

  private snapshot(): HoldSnapshot {
    return {
      state: this.state,
      totalHoldMs: this.totalHoldMs,
      currentSegmentMs: this.currentSegmentMs,
      bestSegmentMs: this.bestSegmentMs,
      holdCount: this.holdCount,
      positionScore: this.lastPositionCheck.score,
      cues: this.lastPositionCheck.cues,
    }
  }

  update(landmarks: Landmark[]): HoldSnapshot {
    if (landmarks.length < 29) return this.snapshot()

    const check = POSITION_CHECKS[this.exercise](landmarks)
    this.lastPositionCheck = check
    const now = performance.now()

    switch (this.state) {
      case 'WAITING': {
        if (check.valid) {
          this.confirmBuffer++
          if (this.confirmBuffer >= ENTER_THRESHOLD) {
            this.state = 'ENTERING'
            this.confirmBuffer = 0
          }
        } else {
          this.confirmBuffer = 0
        }
        break
      }

      case 'ENTERING': {
        if (check.valid) {
          this.confirmBuffer++
          if (this.confirmBuffer >= ENTER_THRESHOLD) {
            this.state = 'HOLDING'
            this.holdStartMs = now
            this.holdCount++
            this.confirmBuffer = 0
            this.breakBuffer = 0
          }
        } else {
          this.confirmBuffer = 0
          this.breakBuffer++
          if (this.breakBuffer >= BREAK_THRESHOLD) {
            this.state = 'WAITING'
            this.breakBuffer = 0
          }
        }
        break
      }

      case 'HOLDING': {
        // Update current segment timing
        if (this.holdStartMs !== null) {
          this.currentSegmentMs = now - this.holdStartMs
        }

        if (check.valid) {
          this.breakBuffer = 0
        } else {
          this.breakBuffer++
          if (this.breakBuffer >= BREAK_THRESHOLD) {
            // Break the hold — freeze timing
            this.totalHoldMs += this.currentSegmentMs
            if (this.currentSegmentMs > this.bestSegmentMs) {
              this.bestSegmentMs = this.currentSegmentMs
            }
            this.currentSegmentMs = 0
            this.holdStartMs = null
            this.lastBreakMs = now
            this.state = 'BROKEN'
            this.breakBuffer = 0
            this.confirmBuffer = 0
          }
        }
        break
      }

      case 'BROKEN': {
        // Check grace period
        if (this.lastBreakMs !== null && now - this.lastBreakMs > BREAK_GRACE_MS) {
          // Grace expired — stay broken until user re-enters
          // (don't reset totalHoldMs, just wait for re-entry)
        }

        if (check.valid) {
          this.confirmBuffer++
          if (this.confirmBuffer >= ENTER_THRESHOLD) {
            // Re-enter hold
            this.state = 'HOLDING'
            this.holdStartMs = now
            this.holdCount++
            this.confirmBuffer = 0
            this.breakBuffer = 0
            this.lastBreakMs = null
          }
        } else {
          this.confirmBuffer = 0
        }
        break
      }
    }

    // Update total for active hold
    const activeTotalMs = this.state === 'HOLDING'
      ? this.totalHoldMs + this.currentSegmentMs
      : this.totalHoldMs

    return {
      state: this.state,
      totalHoldMs: activeTotalMs,
      currentSegmentMs: this.currentSegmentMs,
      bestSegmentMs: Math.max(this.bestSegmentMs, this.currentSegmentMs),
      holdCount: this.holdCount,
      positionScore: check.score,
      cues: check.cues,
    }
  }
}
