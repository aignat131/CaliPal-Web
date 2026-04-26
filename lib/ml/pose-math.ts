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
