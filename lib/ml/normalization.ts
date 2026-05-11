/**
 * Hardcoded min-max normalization params — no external JSON needed.
 * Features order: [elbow_ang, hip_ang, knee_ang, vert_reach, elbow_vel, hip_vel, knee_vel, vert_vel]
 */
export interface NormalizationParams {
  min: number[]
  range: number[]
}

export const PULLUP_NORM_PARAMS: NormalizationParams = {
  min:   [0.0, 0.0, 0.0, -1.356, -47.611, -70.579, -62.872, -3.312],
  range: [180.0, 180.0, 180.0, 22.375, 99.030, 151.789, 129.873, 7.566],
}

// 4 features only (elbow_ang, hip_ang, knee_ang, vert_reach) — no velocities
export const PUSHUP_NORM_PARAMS: NormalizationParams = {
  min:   [0.0, 0.0, 0.0, -2.0],
  range: [180.0, 180.0, 180.0, 4.0],
}

/** Min-max normalize a feature vector to [0, 1] */
export function normalize(features: number[], params: NormalizationParams): number[] {
  return features.map((v, i) => {
    const r = params.range[i]
    if (r === 0) return 0
    return Math.max(0, Math.min(1, (v - params.min[i]) / r))
  })
}

/**
 * Linearly resample a sequence of frames to exactly targetLength frames.
 * Each frame is an array of features.
 */
export function resampleFrames(frames: number[][], targetLength: number): number[][] {
  if (frames.length === 0) return Array.from({ length: targetLength }, () => new Array(4).fill(0))
  if (frames.length === targetLength) return frames

  const result: number[][] = []
  for (let i = 0; i < targetLength; i++) {
    const t = (i / (targetLength - 1)) * (frames.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, frames.length - 1)
    const alpha = t - lo
    const frame = frames[lo].map((v, j) => v * (1 - alpha) + frames[hi][j] * alpha)
    result.push(frame)
  }
  return result
}
