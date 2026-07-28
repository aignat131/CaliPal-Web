/**
 * Pushup position NN gate — binary classifier that confirms the user is in
 * a pushup position before allowing the rep counter to start.
 *
 * Model: TF.js LayersModel at /models/pushup_position_tfjs/model.json
 * Input:  [1, 46]  — 39 normalized landmark coords + 7 joint angles
 * Output: [1, 1]   — sigmoid probability (>0.5 = pushup position)
 */

import * as tf from '@tensorflow/tfjs'
import { angleBetween, MP } from './pose-math'
import type { Landmark } from './pose-math'

// ── Model singleton (matches pushup-classifier.ts pattern) ───────────────────

let model: tf.LayersModel | null = null
let modelLoading = false
let modelError: string | null = null

export async function loadPositionModel(): Promise<boolean> {
  if (model) return true
  if (modelLoading) return false
  modelLoading = true
  try {
    model = await tf.loadLayersModel('/models/pushup_position_tfjs/model.json')
    modelError = null
    return true
  } catch (e) {
    modelError = e instanceof Error ? e.message : 'Position model load failed'
    return false
  } finally {
    modelLoading = false
  }
}

export function getPositionModelStatus(): { loaded: boolean; error: string | null } {
  return { loaded: !!model, error: modelError }
}

// ── Feature extraction ───────────────────────────────────────────────────────

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

// ── Inference ────────────────────────────────────────────────────────────────

async function classifyPushupPosition(lms: Landmark[]): Promise<number | null> {
  if (!model) {
    const ok = await loadPositionModel()
    if (!ok || !model) return null
  }
  const features = extractPositionFeatures(lms)
  if (!features) return null

  const input = tf.tensor2d(features, [1, 46])
  try {
    const result = model!.predict(input) as tf.Tensor
    const prob = (await result.data())[0]
    result.dispose()
    return prob
  } finally {
    input.dispose()
  }
}

// ── Gate state machine ───────────────────────────────────────────────────────

export type GateState =
  | 'LOADING'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'RECHECKING'
  | 'FALLBACK'

const INFERENCE_INTERVAL = 6          // run NN every 6th frame (~5 Hz at 30 fps)
const CONFIRM_COUNT = 3               // 3 consecutive positives to confirm
const RECHECK_FAIL_COUNT = 3          // 3 consecutive negatives during recheck → back to VERIFYING
const DRIFT_FRAME_THRESHOLD = 75      // ~2.5 seconds at 30 fps
const HEAD_DRIFT_THRESHOLD = 0.15     // normalized Y — head moved significantly
const SH_DRIFT_THRESHOLD = 0.12       // shoulder-hip vertical diff change

export class PushupNNGate {
  private state: GateState = 'LOADING'
  private frameCount = 0

  // Verification
  private consecutivePositive = 0
  private pendingInference = false

  // Drift baseline (captured at confirmation)
  private baselineHeadY: number | null = null
  private baselineShDiff: number | null = null
  private driftFrameCount = 0

  // Recheck
  private recheckNegatives = 0

  // Latest frame data (for baseline capture in async callbacks)
  private latestLandmarks: Landmark[] | null = null
  private latestElbow = 0

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
    const ok = await loadPositionModel()
    this.state = ok ? 'VERIFYING' : 'FALLBACK'
  }

  /** Call every frame with current landmarks and smoothed elbow angle. */
  update(landmarks: Landmark[], elbowAngle: number): void {
    this.latestLandmarks = landmarks
    this.latestElbow = elbowAngle
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
    this.consecutivePositive = 0
    this.pendingInference = false
    this.baselineHeadY = null
    this.baselineShDiff = null
    this.driftFrameCount = 0
    this.recheckNegatives = 0
  }

  // ── Private ────────────────────────────────────────────────────────────

  private handleVerifying(lms: Landmark[]): void {
    if (this.frameCount % INFERENCE_INTERVAL !== 0 || this.pendingInference) return

    this.pendingInference = true
    classifyPushupPosition(lms).then(prob => {
      this.pendingInference = false
      if (prob !== null && prob >= 0.5) {
        this.consecutivePositive++
        if (this.consecutivePositive >= CONFIRM_COUNT) {
          this.state = 'CONFIRMED'
          this.captureBaseline()
        }
      } else {
        this.consecutivePositive = 0
      }
    })
  }

  private handleRechecking(lms: Landmark[]): void {
    if (this.frameCount % INFERENCE_INTERVAL !== 0 || this.pendingInference) return

    this.pendingInference = true
    classifyPushupPosition(lms).then(prob => {
      this.pendingInference = false
      if (prob !== null && prob >= 0.5) {
        this.state = 'CONFIRMED'
        this.captureBaseline()
        this.recheckNegatives = 0
      } else {
        this.recheckNegatives++
        if (this.recheckNegatives >= RECHECK_FAIL_COUNT) {
          this.state = 'VERIFYING'
          this.consecutivePositive = 0
          this.recheckNegatives = 0
        }
      }
    })
  }

  private captureBaseline(): void {
    const lms = this.latestLandmarks
    if (!lms || lms.length < 29) return
    this.baselineHeadY = lms[MP.NOSE].y
    this.baselineShDiff = Math.abs(
      (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2 -
      (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
    )
    this.driftFrameCount = 0
  }

  private checkDrift(lms: Landmark[]): void {
    if (this.baselineHeadY === null || this.baselineShDiff === null) return

    const headY = lms[MP.NOSE].y
    const shDiff = Math.abs(
      (lms[MP.LEFT_SHOULDER].y + lms[MP.RIGHT_SHOULDER].y) / 2 -
      (lms[MP.LEFT_HIP].y + lms[MP.RIGHT_HIP].y) / 2
    )

    const headDrifted = Math.abs(headY - this.baselineHeadY) > HEAD_DRIFT_THRESHOLD
    const shDrifted = Math.abs(shDiff - this.baselineShDiff) > SH_DRIFT_THRESHOLD

    if (headDrifted || shDrifted) {
      this.driftFrameCount++
    } else {
      this.driftFrameCount = 0
    }

    if (this.driftFrameCount >= DRIFT_FRAME_THRESHOLD) {
      this.state = 'RECHECKING'
      this.frameCount = 0
      this.driftFrameCount = 0
      this.recheckNegatives = 0
    }
  }
}
