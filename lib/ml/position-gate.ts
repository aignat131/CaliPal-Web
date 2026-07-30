/**
 * Generic NN position gate — binary classifier that confirms the user is in
 * a valid exercise position before allowing the rep counter to start.
 *
 * Supports pushup, pullup, and squat exercises. Each loads its own TF.js
 * LayersModel with identical architecture:
 *   Input:  [1, 46]  — 39 normalized landmark coords + 7 joint angles
 *   Output: [1, 1]   — sigmoid probability (>threshold = in position)
 */

import * as tf from '@tensorflow/tfjs'
import { angleBetween, MP } from './pose-math'
import type { Landmark } from './pose-math'

// ── Exercise type (local definition to avoid coupling to form-coach) ────────

type ExerciseType = 'pullup' | 'pushup' | 'squat'

// ── Per-exercise configuration ──────────────────────────────────────────────

type DriftStrategy = 'horizontal' | 'vertical-arms-up' | 'vertical-standing'

interface GateConfig {
  modelPath: string
  positionThreshold: number
  driftStrategy: DriftStrategy
}

const GATE_CONFIGS: Record<ExerciseType, GateConfig> = {
  pushup: {
    modelPath: '/models/pushup_position_tfjs/model.json',
    positionThreshold: 0.35,
    driftStrategy: 'horizontal',
  },
  pullup: {
    modelPath: '/models/pullup_position_tfjs/model.json',
    positionThreshold: 0.35,
    driftStrategy: 'vertical-arms-up',
  },
  squat: {
    modelPath: '/models/squat_position_tfjs/model.json',
    positionThreshold: 0.35,
    driftStrategy: 'vertical-standing',
  },
}

// ── Model singletons (one per exercise type) ────────────────────────────────

const models = new Map<ExerciseType, tf.LayersModel>()
const loading = new Set<ExerciseType>()
const errors = new Map<ExerciseType, string | null>()

async function loadPositionModel(type: ExerciseType): Promise<boolean> {
  if (models.has(type)) return true
  if (loading.has(type)) return false
  loading.add(type)
  try {
    const m = await tf.loadLayersModel(GATE_CONFIGS[type].modelPath)
    models.set(type, m)
    errors.set(type, null)
    return true
  } catch (e) {
    errors.set(type, e instanceof Error ? e.message : 'Position model load failed')
    return false
  } finally {
    loading.delete(type)
  }
}

export function getPositionModelStatus(type: ExerciseType): { loaded: boolean; error: string | null } {
  return { loaded: models.has(type), error: errors.get(type) ?? null }
}

// ── Feature extraction ──────────────────────────────────────────────────────

/** MediaPipe indices for the 13 key landmarks used in training */
const KEY_INDICES = [
  MP.NOSE,
  MP.LEFT_SHOULDER, MP.RIGHT_SHOULDER,
  MP.LEFT_ELBOW, MP.RIGHT_ELBOW,
  MP.LEFT_WRIST, MP.RIGHT_WRIST,
  MP.LEFT_HIP, MP.RIGHT_HIP,
  MP.LEFT_KNEE, MP.RIGHT_KNEE,
  MP.LEFT_ANKLE, MP.RIGHT_ANKLE,
]

/**
 * Extracts the 46-feature vector from a single frame of MediaPipe landmarks.
 * Returns null if landmarks are insufficient or torso is degenerate.
 *
 * Features:
 *  [0..38]  13 landmarks × 3 coords, centered on hip midpoint, scaled by torso length
 *  [39..45] 7 joint angles / 180
 */
export function extractPositionFeatures(lms: Landmark[]): Float32Array | null {
  if (!lms || lms.length < 29) return null

  // Hip and shoulder midpoints
  const hipMid = {
    x: (lms[MP.LEFT_HIP].x + lms[MP.RIGHT_HIP].x) / 2,
    y: (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2,
    z: (lms[MP.LEFT_HIP].z + lms[MP.RIGHT_HIP].z) / 2,
  }
  const shoulderMid = {
    x: (lms[MP.LEFT_SHOULDER].x + lms[MP.RIGHT_SHOULDER].x) / 2,
    y: (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2,
    z: (lms[MP.LEFT_SHOULDER].z + lms[MP.RIGHT_SHOULDER].z) / 2,
  }

  const dx = shoulderMid.x - hipMid.x
  const dy = shoulderMid.y - hipMid.y
  const dz = shoulderMid.z - hipMid.z
  const torsoLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (torsoLen < 0.001) return null

  const out = new Float32Array(46)

  // 39 normalized landmark coords
  for (let i = 0; i < KEY_INDICES.length; i++) {
    const lm = lms[KEY_INDICES[i]]
    out[i * 3]     = (lm.x - hipMid.x) / torsoLen
    out[i * 3 + 1] = (lm.y - hipMid.y) / torsoLen
    out[i * 3 + 2] = (lm.z - hipMid.z) / torsoLen
  }

  // 7 joint angles / 180
  out[39] = angleBetween(lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_HIP]) / 180
  out[40] = angleBetween(lms[MP.LEFT_ELBOW], lms[MP.LEFT_SHOULDER], lms[MP.LEFT_HIP]) / 180
  out[41] = angleBetween(lms[MP.RIGHT_KNEE], hipMid as Landmark, lms[MP.LEFT_KNEE]) / 180
  out[42] = angleBetween(lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE]) / 180
  out[43] = angleBetween(lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE]) / 180
  out[44] = angleBetween(lms[MP.RIGHT_WRIST], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_SHOULDER]) / 180
  out[45] = angleBetween(lms[MP.LEFT_WRIST], lms[MP.LEFT_ELBOW], lms[MP.LEFT_SHOULDER]) / 180

  // Sanity check — no NaN/Inf
  for (let i = 0; i < 46; i++) {
    if (!isFinite(out[i])) return null
  }

  return out
}

// ── Inference ───────────────────────────────────────────────────────────────

async function classifyPosition(type: ExerciseType, lms: Landmark[]): Promise<number | null> {
  let m = models.get(type)
  if (!m) {
    const ok = await loadPositionModel(type)
    if (!ok) return null
    m = models.get(type)
    if (!m) return null
  }
  const features = extractPositionFeatures(lms)
  if (!features) return null

  const input = tf.tensor2d(features, [1, 46])
  try {
    const result = m.predict(input) as tf.Tensor
    const prob = (await result.data())[0]
    result.dispose()
    return prob
  } finally {
    input.dispose()
  }
}

// ── Gate state machine ──────────────────────────────────────────────────────

export type GateState =
  | 'LOADING'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'RECHECKING'
  | 'FALLBACK'

const INFERENCE_INTERVAL = 3          // run NN every 3rd frame (~10 Hz at 30 fps)
const WINDOW_SIZE = 3                 // sliding window for majority vote
const CONFIRM_COUNT = 2               // 2 out of 3 positives to confirm
const RECHECK_FAIL_COUNT = 2          // 2 out of 3 negatives during recheck → back to VERIFYING
const DRIFT_FRAME_THRESHOLD = 50      // ~1.7 seconds at 30 fps
const DRIFT_THRESHOLD_PRIMARY = 0.20  // primary metric drift
const DRIFT_THRESHOLD_SECONDARY = 0.15 // secondary metric drift
const STALE_MS = 2000                 // if no landmarks for 2s, gate goes to VERIFYING

export class PositionGate {
  private exerciseType: ExerciseType
  private config: GateConfig
  private state: GateState = 'LOADING'
  private frameCount = 0

  // Verification — sliding window majority vote
  private recentResults: boolean[] = []
  private pendingInference = false

  // Drift baseline (captured at confirmation)
  private baselineMetric1: number | null = null
  private baselineMetric2: number | null = null
  private driftFrameCount = 0

  // Recheck — sliding window majority vote
  private recheckResults: boolean[] = []

  // Latest frame data (for baseline capture in async callbacks)
  private latestLandmarks: Landmark[] | null = null
  private latestAngle = 0

  // Staleness: detect when landmarks disappear
  private lastUpdateMs = 0

  constructor(exerciseType: ExerciseType) {
    this.exerciseType = exerciseType
    this.config = GATE_CONFIGS[exerciseType]
  }

  get gateState(): GateState { return this.state }

  /** Whether rep counting should proceed this frame */
  get isOpen(): boolean {
    return this.state === 'CONFIRMED'
      || this.state === 'RECHECKING'
      || this.state === 'FALLBACK'
  }

  /** Call once at startup. Loads the model and transitions to VERIFYING or FALLBACK. */
  async initialize(): Promise<void> {
    this.state = 'LOADING'
    const ok = await loadPositionModel(this.exerciseType)
    this.state = ok ? 'VERIFYING' : 'FALLBACK'
  }

  /**
   * Call from the rAF loop even when no landmarks are detected.
   * If the gate is CONFIRMED/RECHECKING and no update arrives for STALE_MS,
   * transitions to VERIFYING (user likely left the frame or picked up phone).
   */
  tick(): void {
    if (!this.isOpen || this.state === 'FALLBACK') return
    if (this.lastUpdateMs > 0 && performance.now() - this.lastUpdateMs > STALE_MS) {
      this.state = 'VERIFYING'
      this.recentResults = []
      this.driftFrameCount = 0
      this.recheckResults = []
    }
  }

  /** Call every frame with current landmarks and smoothed joint angle. */
  update(landmarks: Landmark[], jointAngle: number): void {
    this.latestLandmarks = landmarks
    this.latestAngle = jointAngle
    this.lastUpdateMs = performance.now()
    this.frameCount++

    switch (this.state) {
      case 'LOADING':
      case 'FALLBACK':
        break

      case 'VERIFYING':
        this.handleVerifying(landmarks)
        break

      case 'CONFIRMED':
        this.checkDrift(landmarks)
        break

      case 'RECHECKING':
        this.handleRechecking(landmarks)
        break
    }
  }

  reset(): void {
    const wasLoaded = this.state !== 'LOADING' && this.state !== 'FALLBACK'
    this.state = this.state === 'FALLBACK' ? 'FALLBACK' : (wasLoaded ? 'VERIFYING' : 'LOADING')
    this.frameCount = 0
    this.recentResults = []
    this.pendingInference = false
    this.baselineMetric1 = null
    this.baselineMetric2 = null
    this.driftFrameCount = 0
    this.recheckResults = []
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private handleVerifying(lms: Landmark[]): void {
    if (this.frameCount % INFERENCE_INTERVAL !== 0 || this.pendingInference) return

    this.pendingInference = true
    classifyPosition(this.exerciseType, lms).then(prob => {
      this.pendingInference = false
      const positive = prob !== null && prob >= this.config.positionThreshold
      this.recentResults.push(positive)
      if (this.recentResults.length > WINDOW_SIZE) this.recentResults.shift()

      const positiveCount = this.recentResults.filter(Boolean).length
      if (positiveCount >= CONFIRM_COUNT && this.recentResults.length >= CONFIRM_COUNT) {
        this.state = 'CONFIRMED'
        this.captureBaseline()
        this.recentResults = []
      }
    })
  }

  private handleRechecking(lms: Landmark[]): void {
    if (this.frameCount % INFERENCE_INTERVAL !== 0 || this.pendingInference) return

    this.pendingInference = true
    classifyPosition(this.exerciseType, lms).then(prob => {
      this.pendingInference = false
      const positive = prob !== null && prob >= this.config.positionThreshold
      this.recheckResults.push(positive)
      if (this.recheckResults.length > WINDOW_SIZE) this.recheckResults.shift()

      const positiveCount = this.recheckResults.filter(Boolean).length
      const negativeCount = this.recheckResults.length - positiveCount

      if (positiveCount >= CONFIRM_COUNT) {
        this.state = 'CONFIRMED'
        this.captureBaseline()
        this.recheckResults = []
      } else if (negativeCount >= RECHECK_FAIL_COUNT && this.recheckResults.length >= RECHECK_FAIL_COUNT) {
        this.state = 'VERIFYING'
        this.recentResults = []
        this.recheckResults = []
      }
    })
  }

  // ── Drift detection (per-exercise strategy) ─────────────────────────────

  private captureBaseline(): void {
    const lms = this.latestLandmarks
    if (!lms || lms.length < 29) return

    switch (this.config.driftStrategy) {
      case 'horizontal':
        // Push-up: head Y + shoulder-hip vertical diff
        this.baselineMetric1 = lms[MP.NOSE].y
        this.baselineMetric2 = Math.abs(
          (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2 -
          (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
        )
        break

      case 'vertical-arms-up':
        // Pull-up: avg wrist Y + shoulder-hip vertical span
        this.baselineMetric1 = (lms[MP.LEFT_WRIST].y + lms[MP.RIGHT_WRIST].y) / 2
        this.baselineMetric2 = Math.abs(
          (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2 -
          (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
        )
        break

      case 'vertical-standing':
        // Squat: avg hip Y + ankle-shoulder vertical span
        this.baselineMetric1 = (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
        this.baselineMetric2 =
          (lms[MP.LEFT_ANKLE].y + lms[MP.RIGHT_ANKLE].y) / 2 -
          (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2
        break
    }

    this.driftFrameCount = 0
  }

  private checkDrift(lms: Landmark[]): void {
    if (this.baselineMetric1 === null || this.baselineMetric2 === null) return

    let metric1Drifted = false
    let metric2Drifted = false

    switch (this.config.driftStrategy) {
      case 'horizontal': {
        // Push-up: head Y drift + shoulder-hip diff drift
        const headY = lms[MP.NOSE].y
        const shDiff = Math.abs(
          (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2 -
          (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
        )
        metric1Drifted = Math.abs(headY - this.baselineMetric1) > DRIFT_THRESHOLD_PRIMARY
        metric2Drifted = Math.abs(shDiff - this.baselineMetric2) > DRIFT_THRESHOLD_SECONDARY
        break
      }

      case 'vertical-arms-up': {
        // Pull-up: wrist Y drift (arms came down) + shoulder-hip span drift
        const wristY = (lms[MP.LEFT_WRIST].y + lms[MP.RIGHT_WRIST].y) / 2
        const shDiff = Math.abs(
          (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2 -
          (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
        )
        metric1Drifted = Math.abs(wristY - this.baselineMetric1) > DRIFT_THRESHOLD_PRIMARY
        metric2Drifted = Math.abs(shDiff - this.baselineMetric2) > DRIFT_THRESHOLD_SECONDARY
        break
      }

      case 'vertical-standing': {
        // Squat: hip Y drift (sat/lay down) + vertical span drift
        const hipY = (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
        const vertSpan =
          (lms[MP.LEFT_ANKLE].y + lms[MP.RIGHT_ANKLE].y) / 2 -
          (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2
        metric1Drifted = Math.abs(hipY - this.baselineMetric1) > DRIFT_THRESHOLD_PRIMARY
        metric2Drifted = Math.abs(vertSpan - this.baselineMetric2) > DRIFT_THRESHOLD_SECONDARY
        break
      }
    }

    if (metric1Drifted || metric2Drifted) {
      this.driftFrameCount++
    } else {
      this.driftFrameCount = 0
    }

    if (this.driftFrameCount >= DRIFT_FRAME_THRESHOLD) {
      this.state = 'RECHECKING'
      this.frameCount = 0
      this.driftFrameCount = 0
      this.recheckResults = []
    }
  }
}
