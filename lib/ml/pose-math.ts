/** 3-component landmark from MediaPipe */
export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

/**
 * Calculates the angle (in degrees) at point B, formed by the vectors B→A and B→C.
 * Port of PoseMathUtils.angleBetween()
 */
export function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }

  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2)
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2)

  if (magBA === 0 || magBC === 0) return 0
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  return (Math.acos(cosAngle) * 180) / Math.PI
}

/**
 * Calculates the angle (in degrees) at point B using only X and Y coordinates.
 * Ignores Z-depth to avoid noise from front-facing cameras.
 */
export function angleBetween2D(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = { x: a.x - b.x, y: a.y - b.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }

  const dot = ba.x * bc.x + ba.y * bc.y
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2)
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2)

  if (magBA === 0 || magBC === 0) return 0
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  return (Math.acos(cosAngle) * 180) / Math.PI
}

/**
 * Calculates the vertical reach: how high the wrist is above the hip (positive = above).
 * Returns the Y-axis difference, normalized by torso height.
 * Port of PoseMathUtils.verticalReach()
 */
export function verticalReach(
  wrist: Landmark,
  hip: Landmark,
  shoulder: Landmark
): number {
  const torsoHeight = Math.abs(shoulder.y - hip.y)
  if (torsoHeight < 0.001) return 0
  return (hip.y - wrist.y) / torsoHeight // positive when wrist is above hip
}

/** Average of left and right elbow angles */
export function avgElbowAngle(
  leftShoulder: Landmark, leftElbow: Landmark, leftWrist: Landmark,
  rightShoulder: Landmark, rightElbow: Landmark, rightWrist: Landmark
): number {
  const left = angleBetween(leftShoulder, leftElbow, leftWrist)
  const right = angleBetween(rightShoulder, rightElbow, rightWrist)
  return (left + right) / 2
}

/** Average of left and right knee angles (hip → knee → ankle) */
export function avgKneeAngle(
  leftHip: Landmark, leftKnee: Landmark, leftAnkle: Landmark,
  rightHip: Landmark, rightKnee: Landmark, rightAnkle: Landmark
): number {
  const left = angleBetween(leftHip, leftKnee, leftAnkle)
  const right = angleBetween(rightHip, rightKnee, rightAnkle)
  return (left + right) / 2
}

/**
 * Easy-mode elbow angle: picks the side whose three joints have the highest
 * minimum visibility score. Handles phone-in-front placement where one side
 * may be partially occluded.
 */
export function bestElbowAngle(
  leftShoulder: Landmark, leftElbow: Landmark, leftWrist: Landmark,
  rightShoulder: Landmark, rightElbow: Landmark, rightWrist: Landmark
): number {
  const leftVis  = Math.min(leftShoulder.visibility ?? 0, leftElbow.visibility ?? 0, leftWrist.visibility ?? 0)
  const rightVis = Math.min(rightShoulder.visibility ?? 0, rightElbow.visibility ?? 0, rightWrist.visibility ?? 0)
  if (leftVis >= rightVis) return angleBetween(leftShoulder, leftElbow, leftWrist)
  return angleBetween(rightShoulder, rightElbow, rightWrist)
}

/**
 * 2D variant of bestElbowAngle — ignores Z-depth to avoid noise from
 * front-facing cameras. Critical for pull-ups where MediaPipe's Z estimation
 * is unreliable (arms above head, partially occluded by bar).
 */
export function bestElbowAngle2D(
  leftShoulder: Landmark, leftElbow: Landmark, leftWrist: Landmark,
  rightShoulder: Landmark, rightElbow: Landmark, rightWrist: Landmark
): number {
  const leftVis  = Math.min(leftShoulder.visibility ?? 0, leftElbow.visibility ?? 0, leftWrist.visibility ?? 0)
  const rightVis = Math.min(rightShoulder.visibility ?? 0, rightElbow.visibility ?? 0, rightWrist.visibility ?? 0)
  if (leftVis >= rightVis) return angleBetween2D(leftShoulder, leftElbow, leftWrist)
  return angleBetween2D(rightShoulder, rightElbow, rightWrist)
}

/**
 * Easy-mode knee angle: picks the side whose three joints have the highest
 * minimum visibility score.
 */
export function bestKneeAngle(
  leftHip: Landmark, leftKnee: Landmark, leftAnkle: Landmark,
  rightHip: Landmark, rightKnee: Landmark, rightAnkle: Landmark
): number {
  const leftVis  = Math.min(leftHip.visibility ?? 0, leftKnee.visibility ?? 0, leftAnkle.visibility ?? 0)
  const rightVis = Math.min(rightHip.visibility ?? 0, rightKnee.visibility ?? 0, rightAnkle.visibility ?? 0)
  if (leftVis >= rightVis) return angleBetween(leftHip, leftKnee, leftAnkle)
  return angleBetween(rightHip, rightKnee, rightAnkle)
}

/**
 * Squat depth angle that works from any camera angle.
 *
 * Blends a 2D knee angle (Z-depth ignored to avoid front-camera noise)
 * with a Y-position-based depth metric.
 * The 2D angle works well from the side; from the front it stays ~180°
 * (hip/knee/ankle vertically aligned) so the Y-based metric takes over.
 * The Y-based metric uses the hip-knee vertical gap normalized by body
 * height, which is reliable from ANY camera angle.
 *
 * Returns Math.min(knee2D, yAngle) — whichever shows more bend wins.
 */
export function squatDepthAngle(
  leftHip: Landmark, leftKnee: Landmark, leftAnkle: Landmark,
  rightHip: Landmark, rightKnee: Landmark, rightAnkle: Landmark,
  leftShoulder: Landmark, rightShoulder: Landmark,
): number {
  // Use 2D knee angle (ignoring Z-depth noise from front-facing cameras)
  const leftVis  = Math.min(leftHip.visibility ?? 0, leftKnee.visibility ?? 0, leftAnkle.visibility ?? 0)
  const rightVis = Math.min(rightHip.visibility ?? 0, rightKnee.visibility ?? 0, rightAnkle.visibility ?? 0)
  const knee2D = leftVis >= rightVis
    ? angleBetween2D(leftHip, leftKnee, leftAnkle)
    : angleBetween2D(rightHip, rightKnee, rightAnkle)

  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2
  const avgHipY = (leftHip.y + rightHip.y) / 2
  const avgKneeY = (leftKnee.y + rightKnee.y) / 2

  const bodyHeight = ((leftAnkle.y + rightAnkle.y) / 2) - avgShoulderY
  if (bodyHeight < 0.01) return knee2D

  // How far apart hip and knee are vertically, normalized by body height
  // Standing: ~0.30-0.35 (hip well above knee)
  // Deep squat: ~0.0-0.05 (hip at knee level)
  const hipKneeGap = (avgKneeY - avgHipY) / bodyHeight

  // Linear map: gap 0.0 → 70°, gap 0.35 → 170°
  const yAngle = Math.max(60, Math.min(175, 70 + hipKneeGap * (170 - 70) / 0.35))

  return Math.min(knee2D, yAngle)
}

// ── Per-leg data (pistol squat support) ──────────────────────────────────────

/** Per-leg knee angles and ankle positions for pistol squat detection */
export interface PerLegData {
  leftKneeAngle: number
  rightKneeAngle: number
  leftAnkleY: number
  rightAnkleY: number
}

/** Returns individual knee angles (2D) and ankle Y positions for each leg. */
export function perLegSquatData(landmarks: Landmark[]): PerLegData {
  return {
    leftKneeAngle: angleBetween2D(landmarks[MP.LEFT_HIP], landmarks[MP.LEFT_KNEE], landmarks[MP.LEFT_ANKLE]),
    rightKneeAngle: angleBetween2D(landmarks[MP.RIGHT_HIP], landmarks[MP.RIGHT_KNEE], landmarks[MP.RIGHT_ANKLE]),
    leftAnkleY: landmarks[MP.LEFT_ANKLE].y,
    rightAnkleY: landmarks[MP.RIGHT_ANKLE].y,
  }
}

// ── Body rise metrics (pull-up body-movement verification) ──────────────────

/** Vertical body-position snapshot for pull-up body-rise verification */
export interface BodyRiseMetrics {
  /** Midpoint Y of left+right shoulders (0 = top, 1 = bottom in MediaPipe coords) */
  shoulderMidY: number
  /** Midpoint Y of left+right hips */
  hipMidY: number
  /** Torso height: abs(shoulderMidY − hipMidY). Used for normalization. */
  torsoHeight: number
  /** Midpoint Y of left+right wrists (for bar detection) */
  wristMidY: number
}

/**
 * Extracts body-rise metrics from full landmarks.
 * Returns null if torso height is degenerate (< 0.01).
 */
export function extractBodyRiseMetrics(landmarks: Landmark[]): BodyRiseMetrics | null {
  if (landmarks.length < 29) return null
  const shoulderMidY = (landmarks[MP.LEFT_SHOULDER].y + landmarks[MP.RIGHT_SHOULDER].y) / 2
  const hipMidY = (landmarks[MP.LEFT_HIP].y + landmarks[MP.RIGHT_HIP].y) / 2
  const torsoHeight = Math.abs(shoulderMidY - hipMidY)
  if (torsoHeight < 0.01) return null
  const wristMidY = (landmarks[MP.LEFT_WRIST].y + landmarks[MP.RIGHT_WRIST].y) / 2
  return { shoulderMidY, hipMidY, torsoHeight, wristMidY }
}

// MediaPipe BlazePose landmark indices
export const MP = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const

/**
 * Exponential Moving Average smoother for a single angle signal.
 * alpha ≈ 0.3: smooths frame-to-frame jitter while remaining
 * responsive enough at ~30 fps to track genuine movement.
 */
export class AngleSmoother {
  private ema: number | null = null
  private prev: number | null = null
  private window: number[] = []
  private readonly windowSize = 5

  constructor(private readonly alpha = 0.3) {}

  /**
   * Feed a raw angle reading. Returns the EMA-smoothed value.
   * Seeds from the first reading so the gauge does not flash from 0.
   */
  smooth(raw: number): number {
    if (!isFinite(raw)) return this.ema ?? raw
    this.prev = this.ema
    this.ema = this.ema === null
      ? raw
      : this.alpha * raw + (1 - this.alpha) * this.ema
    this.window.push(this.ema)
    if (this.window.length > this.windowSize) this.window.shift()
    return this.ema
  }

  /**
   * Frame-to-frame EMA delta.
   * Positive = angle increasing (joint opening), negative = joint closing/bending.
   * Returns 0 until at least two frames have been processed.
   */
  getVelocity(): number {
    if (this.prev === null || this.ema === null) return 0
    return this.ema - this.prev
  }

  getValue(): number | null { return this.ema }

  reset(): void { this.ema = null; this.prev = null; this.window = [] }
}
