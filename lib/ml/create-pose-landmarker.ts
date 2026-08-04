import type { PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'

export async function createPoseLandmarker(
  modelAssetPath: string,
  runningMode: 'VIDEO' | 'IMAGE' = 'VIDEO',
): Promise<PoseLandmarker> {
  const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const filesetResolver = await FilesetResolver.forVisionTasks(WASM_CDN)

  try {
    return await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath, delegate: 'GPU' },
      runningMode,
      numPoses: 1,
    })
  } catch {
    // GPU delegate fails on some mobile browsers (asm_consts error) — fall back to CPU
    return await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath, delegate: 'CPU' },
      runningMode,
      numPoses: 1,
    })
  }
}
