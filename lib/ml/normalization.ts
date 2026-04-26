/** Min-max normalization parameters loaded from public/models/normalization_params.json */
export interface NormalizationParams {
  min: number[]
  max: number[]
}

let cachedParams: NormalizationParams | null = null

export async function loadNormalizationParams(): Promise<NormalizationParams> {
  if (cachedParams) return cachedParams
  try {
    const res = await fetch('/models/normalization_params.json')
    if (!res.ok) throw new Error('not found')
    cachedParams = await res.json()
    return cachedParams!
  } catch {
    // Fallback: identity normalization (no-op) if file is missing
    const identity: NormalizationParams = {
      min: new Array(8).fill(0),
      max: new Array(8).fill(180),
    }
    cachedParams = identity
    return identity
  }
}

/** Normalize a single feature vector in-place using min-max scaling → [0, 1] */
export function normalize(features: number[], params: NormalizationParams): number[] {
  return features.map((v, i) => {
    const range = params.max[i] - params.min[i]
    if (range === 0) return 0
    return Math.max(0, Math.min(1, (v - params.min[i]) / range))
  })
}

/**
 * Linearly resample a sequence of frames to exactly targetLength frames.
 * Each frame is an array of features.
 */
export function resampleFrames(frames: number[][], targetLength: number): number[][] {
  if (frames.length === 0) return Array(targetLength).fill(new Array(8).fill(0))
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
