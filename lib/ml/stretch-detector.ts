/**
 * Stretch detector — continuous depth tracking for flexibility exercises.
 *
 * Unlike HoldDetector (binary valid/invalid), stretching is progressive:
 * a front split at 120° is valid but 160° is better. The primary output
 * is a continuous depthScore (0-1) representing stretch depth.
 *
 * State machine: WAITING ↔ IN_POSITION (simple, no BROKEN state)
 */

import { angleBetween2D, bestKneeAngle, MP, AngleSmoother } from './pose-math'
import type { Landmark } from './pose-math'

// ── Types ────────────────────────────────────────────────────────────────────

export type StretchExerciseType =
  | 'front_split'
  | 'side_split'
  | 'forward_fold'
  | 'pike_stretch'
  | 'bridge'
  | 'pancake_stretch'
  | 'pigeon_pose'

export type StretchState = 'WAITING' | 'IN_POSITION'

export interface DepthCheck {
  inPosition: boolean
  depthScore: number
  rawMeasurement: number
  measurementUnit: string
  targetMeasurement: number
  cues: string[]
}

export interface StretchSnapshot {
  state: StretchState
  totalTimeMs: number
  depthScore: number
  peakDepthScore: number
  rawMeasurement: number
  measurementUnit: string
  targetMeasurement: number
  cues: string[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const ENTER_THRESHOLD = 3   // consecutive valid frames to enter (~0.1s at 30fps)
const EXIT_THRESHOLD = 15   // consecutive invalid frames to exit (~0.5s) — lenient

// ── Exercise metadata ────────────────────────────────────────────────────────

export interface StretchExerciseMeta {
  name: string
  nameRO: string
  emoji: string
  color: string
  description: string
  defaultHoldSeconds: number
  difficulty: 'beginner' | 'intermediate' | 'advanced'
}

export const STRETCH_EXERCISES: Record<StretchExerciseType, StretchExerciseMeta> = {
  front_split:     { name: 'Front Split',    nameRO: 'Spagat frontal',   emoji: '🦵', color: '#F43F5E', description: 'Un picior înainte, unul înapoi',         defaultHoldSeconds: 60,  difficulty: 'advanced' },
  side_split:      { name: 'Side Split',     nameRO: 'Spagat lateral',   emoji: '🤸', color: '#8B5CF6', description: 'Picioare depărtate lateral',              defaultHoldSeconds: 60,  difficulty: 'advanced' },
  forward_fold:    { name: 'Forward Fold',   nameRO: 'Îndoire înainte',  emoji: '🙇', color: '#06B6D4', description: 'Mâinile spre podea, genunchi drepți',     defaultHoldSeconds: 45,  difficulty: 'beginner' },
  pike_stretch:    { name: 'Pike Stretch',   nameRO: 'Pike',             emoji: '📐', color: '#3B82F6', description: 'Așezat, picioare întinse, aplecă-te',     defaultHoldSeconds: 45,  difficulty: 'beginner' },
  bridge:          { name: 'Bridge',         nameRO: 'Podul',            emoji: '🌉', color: '#F59E0B', description: 'Arcuiește spatele, mâini și picioare jos', defaultHoldSeconds: 30,  difficulty: 'intermediate' },
  pancake_stretch: { name: 'Pancake',        nameRO: 'Pancake',          emoji: '🥞', color: '#10B981', description: 'Picioare depărtate, trunchi înainte',     defaultHoldSeconds: 60,  difficulty: 'intermediate' },
  pigeon_pose:     { name: 'Pigeon Pose',    nameRO: 'Porumbelul',       emoji: '🕊️', color: '#EC4899', description: 'Un picior îndoit, celălalt extins',       defaultHoldSeconds: 45,  difficulty: 'intermediate' },
}

export const STRETCH_STATE_LABELS: Record<StretchState, string> = {
  WAITING:     'Intră în poziție...',
  IN_POSITION: 'Menține! ✓',
}

export const STRETCH_STATE_COLORS: Record<StretchState, string> = {
  WAITING:     '#6B7280',
  IN_POSITION: '#1ED75F',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function midY(a: Landmark, b: Landmark): number { return (a.y + b.y) / 2 }
function midX(a: Landmark, b: Landmark): number { return (a.x + b.x) / 2 }
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)) }

/** Depth score → color for UI */
export function depthColor(score: number): string {
  if (score >= 0.9) return '#FFD700' // gold
  if (score >= 0.7) return '#1ED75F' // green
  if (score >= 0.4) return '#F59E0B' // yellow/amber
  if (score >= 0.2) return '#F97316' // orange
  return '#EF4444'                    // red
}

// ── Position checks ──────────────────────────────────────────────────────────

function checkFrontSplit(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const hipMid: Landmark = {
    x: (lms[MP.LEFT_HIP].x + lms[MP.RIGHT_HIP].x) / 2,
    y: (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2,
    z: 0,
  }
  const shoulderMidX = midX(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const shoulderMidY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])

  // Determine front/back ankle by Y position (lower Y = higher in frame)
  const leftAnkle = lms[MP.LEFT_ANKLE]
  const rightAnkle = lms[MP.RIGHT_ANKLE]

  // Measure the angle between the two leg lines at the hip
  const angle = angleBetween2D(leftAnkle, hipMid, rightAnkle)

  // Depth score: 90° (standing) = 0, 180° (full split) = 1
  const depthScore = clamp01((angle - 90) / 90)
  const inPosition = angle > 100 && hipMid.y > shoulderMidY + 0.03

  // Cues
  const lateralDrift = Math.abs(shoulderMidX - hipMid.x)
  if (lateralDrift > 0.12) cues.push('Menține trunchiul drept')
  const hipLevelDiff = Math.abs(lms[MP.LEFT_HIP].y - lms[MP.RIGHT_HIP].y)
  if (hipLevelDiff > 0.06) cues.push('Păstrează șoldurile drepte')

  return { inPosition, depthScore, rawMeasurement: Math.round(angle), measurementUnit: '°', targetMeasurement: 180, cues }
}

function checkSideSplit(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const leftAnkle = lms[MP.LEFT_ANKLE]
  const rightAnkle = lms[MP.RIGHT_ANKLE]
  const shoulderMidY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipMidY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const ankleMidY = midY(leftAnkle, rightAnkle)

  // Body height for normalization
  const bodyHeight = Math.abs(ankleMidY - shoulderMidY)
  if (bodyHeight < 0.05) return { inPosition: false, depthScore: 0, rawMeasurement: 0, measurementUnit: '°', targetMeasurement: 180, cues: [] }

  // Horizontal spread ratio
  const spread = Math.abs(leftAnkle.x - rightAnkle.x)
  const spreadRatio = spread / bodyHeight

  // Convert to approximate degrees (standing ~0.3 ratio → ~60°, full split ~1.5 → 180°)
  const approxAngle = Math.min(180, Math.round(spreadRatio * 120))
  const depthScore = clamp01((spreadRatio - 0.3) / 1.2)
  const inPosition = spreadRatio > 0.5 && shoulderMidY < hipMidY

  // Cues
  if (shoulderMidY >= hipMidY) cues.push('Menține trunchiul drept')

  return { inPosition, depthScore, rawMeasurement: approxAngle, measurementUnit: '°', targetMeasurement: 180, cues }
}

function checkForwardFold(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const wristMidY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])
  const ankleMidY = midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE])
  const hipMidY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const shoulderMidY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])

  // Distance from wrists to ankle level (positive = wrists above ankles)
  const wristToAnkle = wristMidY - ankleMidY

  // Standing: wrists at hip level (~0.3 above ankles). Touching floor = 0. Below = negative.
  const standingDist = hipMidY - ankleMidY
  if (standingDist < 0.05) return { inPosition: false, depthScore: 0, rawMeasurement: 0, measurementUnit: '%', targetMeasurement: 100, cues: [] }

  const depthScore = clamp01(1 - (wristToAnkle / standingDist))

  // Check if user is actually bending (torso not vertical)
  const torsoTilt = shoulderMidY - hipMidY // negative when bent forward (shoulders below hips)
  const inPosition = torsoTilt > -0.02 ? false : true // needs some forward tilt

  // Knee check
  const kneeAngle = bestKneeAngle(
    lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
    lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE],
  )
  if (kneeAngle < 155) cues.push('Întinde genunchii')

  const pct = Math.round(depthScore * 100)
  return { inPosition, depthScore, rawMeasurement: pct, measurementUnit: '%', targetMeasurement: 100, cues }
}

function checkPikeStretch(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const shoulderMid: Landmark = {
    x: midX(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER]),
    y: midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER]),
    z: 0,
  }
  const hipMid: Landmark = {
    x: midX(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP]),
    y: midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP]),
    z: 0,
  }
  const ankleMid: Landmark = {
    x: midX(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE]),
    y: midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE]),
    z: 0,
  }

  // Hip fold angle: shoulder-hip-ankle
  // Sitting upright ≈ 90°, folded flat ≈ 0-30°
  const hipAngle = angleBetween2D(shoulderMid, hipMid, ankleMid)

  // Score: 90° = 0, 0° = 1
  const depthScore = clamp01((90 - hipAngle) / 90)

  // In position: ankles roughly at hip level (seated) and some forward lean
  const seated = Math.abs(ankleMid.y - hipMid.y) < 0.15
  const inPosition = seated && hipAngle < 85

  // Knee check
  const kneeAngle = bestKneeAngle(
    lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
    lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE],
  )
  if (kneeAngle < 150) cues.push('Întinde genunchii')
  if (hipAngle > 70) cues.push('Aplecă-te mai mult înainte')

  const displayAngle = Math.round(90 - hipAngle)
  return { inPosition, depthScore, rawMeasurement: Math.max(0, displayAngle), measurementUnit: '°', targetMeasurement: 90, cues }
}

function checkBridge(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const shoulderMidY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipMidY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const wristMidY = midY(lms[MP.LEFT_WRIST], lms[MP.RIGHT_WRIST])
  const ankleMidY = midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE])

  // Bridge: hands and feet on ground (high Y), hips pushed up (low Y)
  // In MediaPipe: high Y = bottom of frame = ground
  const groundLevel = Math.max(wristMidY, ankleMidY)
  const hipElevation = groundLevel - hipMidY // positive when hips above ground

  // Normalize by torso length
  const torsoLen = Math.abs(shoulderMidY - hipMidY)
  const normalizedElevation = torsoLen > 0.03 ? hipElevation / torsoLen : 0

  const depthScore = clamp01(normalizedElevation / 1.5)

  // In position: wrists near or below shoulders (hands on ground), hips elevated
  const handsDown = wristMidY > shoulderMidY - 0.05
  const inPosition = handsDown && hipElevation > 0.03

  // Arm extension check
  const leftElbow = angleBetween2D(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST])
  const rightElbow = angleBetween2D(lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
  const avgElbow = (leftElbow + rightElbow) / 2
  if (avgElbow < 150) cues.push('Întinde brațele')
  if (hipElevation < 0.08) cues.push('Împinge șoldurile mai sus')

  const pct = Math.round(depthScore * 100)
  return { inPosition, depthScore, rawMeasurement: pct, measurementUnit: '%', targetMeasurement: 100, cues }
}

function checkPancakeStretch(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const leftAnkle = lms[MP.LEFT_ANKLE]
  const rightAnkle = lms[MP.RIGHT_ANKLE]
  const shoulderMidY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
  const hipMidY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const ankleMidY = midY(leftAnkle, rightAnkle)

  const bodyHeight = Math.abs(ankleMidY - shoulderMidY)
  if (bodyHeight < 0.05) return { inPosition: false, depthScore: 0, rawMeasurement: 0, measurementUnit: '%', targetMeasurement: 100, cues: [] }

  // Spread score (same as side split)
  const spread = Math.abs(leftAnkle.x - rightAnkle.x)
  const spreadRatio = spread / bodyHeight
  const spreadScore = clamp01((spreadRatio - 0.3) / 1.2)

  // Fold score (how close chest is to floor)
  // Seated: shoulders near hip level. Folded: shoulders near or below hips
  const foldDist = shoulderMidY - hipMidY // positive = shoulders below hips (folded forward)
  const torsoLen = Math.abs(shoulderMidY - hipMidY)
  const foldScore = torsoLen > 0.02 ? clamp01(foldDist / 0.15) : 0

  const depthScore = spreadScore * 0.5 + foldScore * 0.5
  const inPosition = spreadRatio > 0.4 && Math.abs(ankleMidY - hipMidY) < 0.15

  if (spreadRatio < 0.6) cues.push('Depărtează picioarele mai mult')
  if (foldScore < 0.3) cues.push('Aplecă trunchiul înainte')

  const pct = Math.round(depthScore * 100)
  return { inPosition, depthScore, rawMeasurement: pct, measurementUnit: '%', targetMeasurement: 100, cues }
}

function checkPigeonPose(lms: Landmark[]): DepthCheck {
  const cues: string[] = []

  const leftKneeAngle = angleBetween2D(lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE])
  const rightKneeAngle = angleBetween2D(lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE])
  const hipMidY = midY(lms[MP.LEFT_HIP], lms[MP.RIGHT_HIP])
  const ankleMidY = midY(lms[MP.LEFT_ANKLE], lms[MP.RIGHT_ANKLE])
  const shoulderMidY = midY(lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])

  // One knee bent (< 120°), one straight (> 140°)
  const kneeDiff = Math.abs(leftKneeAngle - rightKneeAngle)
  const hasAsymmetry = kneeDiff > 30
  const bentKnee = Math.min(leftKneeAngle, rightKneeAngle)
  const straightKnee = Math.max(leftKneeAngle, rightKneeAngle)

  // Hip depth: how low hips are relative to body height
  const bodyHeight = Math.abs(ankleMidY - shoulderMidY)
  const hipDepth = bodyHeight > 0.05 ? clamp01((ankleMidY - hipMidY) / bodyHeight) : 0
  // Lower hips relative to ankles = deeper stretch (hipDepth closer to 0 means hips at ankle level)

  // Combined score
  const asymmetryScore = clamp01(kneeDiff / 60)
  const bendScore = clamp01((120 - bentKnee) / 60) // more bent = better
  const depthScore = asymmetryScore * 0.3 + bendScore * 0.3 + (1 - hipDepth) * 0.4

  const inPosition = hasAsymmetry && bentKnee < 130

  if (straightKnee < 150) cues.push('Întinde piciorul din spate')
  if (Math.abs(lms[MP.LEFT_HIP].y - lms[MP.RIGHT_HIP].y) > 0.06) cues.push('Menține șoldurile drepte')

  const pct = Math.round(depthScore * 100)
  return { inPosition, depthScore, rawMeasurement: pct, measurementUnit: '%', targetMeasurement: 100, cues }
}

// ── Check dispatch ───────────────────────────────────────────────────────────

const STRETCH_CHECKS: Record<StretchExerciseType, (lms: Landmark[]) => DepthCheck> = {
  front_split: checkFrontSplit,
  side_split: checkSideSplit,
  forward_fold: checkForwardFold,
  pike_stretch: checkPikeStretch,
  bridge: checkBridge,
  pancake_stretch: checkPancakeStretch,
  pigeon_pose: checkPigeonPose,
}

// ── Angle arc info (which joint to draw the arc at) ──────────────────────────

export interface AngleArcInfo {
  /** Landmark index of the vertex (where the arc is drawn) */
  vertex: number
  /** Landmark index of one arm of the angle */
  armA: number
  /** Landmark index of the other arm */
  armB: number
}

/** Returns the joint info for drawing the angle arc on the skeleton, or null if N/A */
export function getAngleArcInfo(exercise: StretchExerciseType): AngleArcInfo | null {
  switch (exercise) {
    case 'front_split':
    case 'side_split':
    case 'pancake_stretch':
      return null // uses spread, not a single joint angle
    case 'forward_fold':
    case 'pike_stretch':
      // Hip fold angle
      return { vertex: MP.LEFT_HIP, armA: MP.LEFT_SHOULDER, armB: MP.LEFT_ANKLE }
    case 'bridge':
      return null // uses hip elevation, not a single angle
    case 'pigeon_pose':
      return null // asymmetric, complex
  }
}

// ── StretchDetector class ────────────────────────────────────────────────────

export class StretchDetector {
  private exercise: StretchExerciseType
  private state: StretchState = 'WAITING'
  private confirmBuffer = 0
  private exitBuffer = 0

  // Timing
  private holdStartMs: number | null = null
  private totalTimeMs = 0

  // Depth
  private depthSmoother = new AngleSmoother(0.2)
  private peakDepthScore = 0
  private lastCheck: DepthCheck = { inPosition: false, depthScore: 0, rawMeasurement: 0, measurementUnit: '', targetMeasurement: 0, cues: [] }

  constructor(exercise: StretchExerciseType) {
    this.exercise = exercise
  }

  reset() {
    this.state = 'WAITING'
    this.confirmBuffer = 0
    this.exitBuffer = 0
    this.holdStartMs = null
    this.totalTimeMs = 0
    this.depthSmoother.reset()
    this.peakDepthScore = 0
    this.lastCheck = { inPosition: false, depthScore: 0, rawMeasurement: 0, measurementUnit: '', targetMeasurement: 0, cues: [] }
  }

  private snapshot(smoothedDepth: number): StretchSnapshot {
    return {
      state: this.state,
      totalTimeMs: this.state === 'IN_POSITION' && this.holdStartMs
        ? this.totalTimeMs + (performance.now() - this.holdStartMs)
        : this.totalTimeMs,
      depthScore: smoothedDepth,
      peakDepthScore: this.peakDepthScore,
      rawMeasurement: this.lastCheck.rawMeasurement,
      measurementUnit: this.lastCheck.measurementUnit,
      targetMeasurement: this.lastCheck.targetMeasurement,
      cues: this.lastCheck.cues,
    }
  }

  update(landmarks: Landmark[]): StretchSnapshot {
    if (landmarks.length < 29) return this.snapshot(0)

    const check = STRETCH_CHECKS[this.exercise](landmarks)
    this.lastCheck = check

    // Smooth the depth score for stable display
    const smoothedDepth = this.depthSmoother.smooth(check.depthScore * 100) / 100

    if (smoothedDepth > this.peakDepthScore) {
      this.peakDepthScore = smoothedDepth
    }

    const now = performance.now()

    switch (this.state) {
      case 'WAITING': {
        if (check.inPosition) {
          this.confirmBuffer++
          if (this.confirmBuffer >= ENTER_THRESHOLD) {
            this.state = 'IN_POSITION'
            this.holdStartMs = now
            this.confirmBuffer = 0
            this.exitBuffer = 0
          }
        } else {
          this.confirmBuffer = 0
        }
        break
      }

      case 'IN_POSITION': {
        if (check.inPosition) {
          this.exitBuffer = 0
        } else {
          this.exitBuffer++
          if (this.exitBuffer >= EXIT_THRESHOLD) {
            // Pause timer, accumulate time
            if (this.holdStartMs !== null) {
              this.totalTimeMs += now - this.holdStartMs
              this.holdStartMs = null
            }
            this.state = 'WAITING'
            this.exitBuffer = 0
            this.confirmBuffer = 0
          }
        }
        break
      }
    }

    return this.snapshot(smoothedDepth)
  }
}
