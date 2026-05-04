import type { Landmark } from './pose-math'
import { angleBetween, verticalReach, MP } from './pose-math'
import { normalize, resampleFrames, loadNormalizationParams } from './normalization'
import type { NormalizationParams } from './normalization'

export const TARGET_FRAMES = 90
export const FEATURES_PER_FRAME = 8

/**
 * Extract 8 features from a single MediaPipe pose frame.
 * Port of PosePreprocessor.kt extractFeatures()
 *
 * Features (all in degrees unless noted):
 *  0: left elbow angle  (shoulder–elbow–wrist)
 *  1: right elbow angle
 *  2: left shoulder angle (elbow–shoulder–hip)
 *  3: right shoulder angle
 *  4: left hip angle (shoulder–hip–knee)
 *  5: right hip angle
 *  6: left vertical reach (wrist above hip, normalized by torso)  × 90 to bring to degree-like scale
 *  7: right vertical reach
 */
const REQUIRED_LANDMARKS = 33

export function extractFeatures(landmarks: Landmark[]): number[] {
  if (landmarks.length < REQUIRED_LANDMARKS) return new Array(8).fill(0)
  const lShoulder = landmarks[MP.LEFT_SHOULDER]
  const rShoulder = landmarks[MP.RIGHT_SHOULDER]
  const lElbow = landmarks[MP.LEFT_ELBOW]
  const rElbow = landmarks[MP.RIGHT_ELBOW]
  const lWrist = landmarks[MP.LEFT_WRIST]
  const rWrist = landmarks[MP.RIGHT_WRIST]
  const lHip = landmarks[MP.LEFT_HIP]
  const rHip = landmarks[MP.RIGHT_HIP]
  const lKnee = landmarks[MP.LEFT_KNEE]
  const rKnee = landmarks[MP.RIGHT_KNEE]

  return [
    angleBetween(lShoulder, lElbow, lWrist),          // 0
    angleBetween(rShoulder, rElbow, rWrist),          // 1
    angleBetween(lElbow, lShoulder, lHip),            // 2
    angleBetween(rElbow, rShoulder, rHip),            // 3
    angleBetween(lShoulder, lHip, lKnee),             // 4
    angleBetween(rShoulder, rHip, rKnee),             // 5
    verticalReach(lWrist, lHip, lShoulder) * 90,      // 6
    verticalReach(rWrist, rHip, rShoulder) * 90,      // 7
  ]
}

/**
 * Preprocess a raw frame buffer into model-ready input:
 * 1. Extract 8 features per frame
 * 2. Resample to TARGET_FRAMES
 * 3. Min-max normalize each feature
 *
 * Returns a flat Float32Array of shape [TARGET_FRAMES × FEATURES_PER_FRAME]
 */
export async function preprocessFrameBuffer(
  frameBuffer: Landmark[][],
  params?: NormalizationParams
): Promise<Float32Array> {
  const normParams = params ?? await loadNormalizationParams()

  // Extract features for each captured frame
  const rawFeatures = frameBuffer.map(extractFeatures)

  // Resample to exactly 90 frames
  const resampled = resampleFrames(rawFeatures, TARGET_FRAMES)

  // Normalize each frame
  const normalized = resampled.map(f => normalize(f, normParams))

  // Flatten to Float32Array [1, 90, 8] → [90 * 8]
  const flat = new Float32Array(TARGET_FRAMES * FEATURES_PER_FRAME)
  normalized.forEach((frame, fi) => {
    frame.forEach((v, vi) => {
      flat[fi * FEATURES_PER_FRAME + vi] = v
    })
  })

  return flat
}
