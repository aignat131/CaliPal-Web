import type { Landmark } from './pose-math'
import { angleBetween, verticalReach, MP } from './pose-math'
import { normalize, resampleFrames } from './normalization'
import type { NormalizationParams } from './normalization'

export const TARGET_FRAMES = 90
export const FEATURES_PER_FRAME = 8   // 4 angles + 4 velocities
const RAW_FEATURES = 4

const REQUIRED_LANDMARKS = 33

/**
 * Extract 4 base angle features from a single MediaPipe pose frame.
 * Returns [elbow_ang, hip_ang, knee_ang, vert_reach]
 * (averaged across left and right sides)
 */
export function extractFeatures(landmarks: Landmark[]): number[] {
  if (landmarks.length < REQUIRED_LANDMARKS) return new Array(RAW_FEATURES).fill(0)

  const lShoulder = landmarks[MP.LEFT_SHOULDER]
  const rShoulder = landmarks[MP.RIGHT_SHOULDER]
  const lElbow    = landmarks[MP.LEFT_ELBOW]
  const rElbow    = landmarks[MP.RIGHT_ELBOW]
  const lWrist    = landmarks[MP.LEFT_WRIST]
  const rWrist    = landmarks[MP.RIGHT_WRIST]
  const lHip      = landmarks[MP.LEFT_HIP]
  const rHip      = landmarks[MP.RIGHT_HIP]
  const lKnee     = landmarks[MP.LEFT_KNEE]
  const rKnee     = landmarks[MP.RIGHT_KNEE]
  const lAnkle    = landmarks[MP.LEFT_ANKLE]
  const rAnkle    = landmarks[MP.RIGHT_ANKLE]

  const elbowAng  = (angleBetween(lShoulder, lElbow, lWrist) + angleBetween(rShoulder, rElbow, rWrist)) / 2
  const hipAng    = (angleBetween(lShoulder, lHip, lKnee)   + angleBetween(rShoulder, rHip, rKnee))   / 2
  const kneeAng   = (angleBetween(lHip, lKnee, lAnkle)      + angleBetween(rHip, rKnee, rAnkle))      / 2
  const vertReach = (verticalReach(lWrist, lHip, lShoulder)  + verticalReach(rWrist, rHip, rShoulder)) / 2

  return [elbowAng, hipAng, kneeAng, vertReach]
}

/**
 * Preprocess a raw frame buffer into model-ready input.
 * 1. Extract 4 base features per frame (elbow_ang, hip_ang, knee_ang, vert_reach)
 * 2. Resample to TARGET_FRAMES
 * 3. Compute frame-to-frame velocities (4 more features)
 * 4. Min-max normalize all 8 features using provided params
 *
 * Returns a flat Float32Array of shape [TARGET_FRAMES × FEATURES_PER_FRAME]
 */
export function preprocessFrameBuffer(
  frameBuffer: Landmark[][],
  params: NormalizationParams,
): Float32Array {
  const rawFeatures = frameBuffer.map(extractFeatures)
  const resampled = resampleFrames(rawFeatures, TARGET_FRAMES)

  // Append velocities: frame[i] - frame[i-1], first frame gets zero velocity
  const withVelocities = resampled.map((frame, i) => {
    const prev = i > 0 ? resampled[i - 1] : frame
    const vels = frame.map((v, j) => v - prev[j])
    return [...frame, ...vels]
  })

  const flat = new Float32Array(TARGET_FRAMES * FEATURES_PER_FRAME)
  withVelocities.forEach((frame, fi) => {
    const normalized = normalize(frame, params)
    normalized.forEach((v, vi) => {
      flat[fi * FEATURES_PER_FRAME + vi] = v
    })
  })

  return flat
}
