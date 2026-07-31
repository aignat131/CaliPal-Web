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
 * Blends the 3D knee angle with a Y-position-based depth metric.
 * The 3D angle works well from the side but stays ~180° from the front
 * (hip/knee/ankle vertically aligned, Z-depth unreliable).
 * The Y-based metric uses the hip-knee vertical gap normalized by body
 * height, which is reliable from ANY camera angle.
 *
 * Returns Math.min(knee3D, yAngle) — whichever shows more bend wins.
 */
export function squatDepthAngle(
  leftHip: Landmark, leftKnee: Landmark, leftAnkle: Landmark,
  rightHip: Landmark, rightKnee: Landmark, rightAnkle: Landmark,
  leftShoulder: Landmark, rightShoulder: Landmark,
): number {
  const knee3D = bestKneeAngle(leftHip, leftKnee, leftAnkle, rightHip, rightKnee, rightAnkle)

  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2
  const avgHipY = (leftHip.y + rightHip.y) / 2
  const avgKneeY = (leftKnee.y + rightKnee.y) / 2
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2

  const bodyHeight = avgAnkleY - avgShoulderY
  if (bodyHeight < 0.01) return knee3D

  // How far apart hip and knee are vertically, normalized by body height
  // Standing: ~0.30-0.35 (hip well above knee)
  // Deep squat: ~0.0-0.05 (hip at knee level)
  const hipKneeGap = (avgKneeY - avgHipY) / bodyHeight

  // Linear map: gap 0.0 → 70°, gap 0.35 → 170°
  const yAngle = Math.max(60, Math.min(175, 70 + hipKneeGap * (170 - 70) / 0.35))

  return Math.min(knee3D, yAngle)
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
