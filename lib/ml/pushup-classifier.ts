/**
 * TF.js wrapper for the push-up form classifier.
 * Model input shape: [1, 90, 8]  (batch=1, frames=90, features=8)
 * Model output: softmax probabilities for form classes
 */

import type { LayersModel, Tensor } from '@tensorflow/tfjs'
import { TARGET_FRAMES, FEATURES_PER_FRAME } from './pose-preprocessor'

export type FormLabel = 'GOOD_FORM' | 'BAD_FORM' | 'UNKNOWN'

export interface ClassificationResult {
  label: FormLabel
  confidence: number
  probabilities: number[]
}

let model: LayersModel | null = null
let modelLoading = false
let modelError: string | null = null

export async function loadPushupModel(): Promise<boolean> {
  if (model) return true
  if (modelLoading) return false
  modelLoading = true

  try {
    const tf = await import('@tensorflow/tfjs')
    model = await tf.loadLayersModel('/models/pushup_tfjs/model.json')
    modelError = null
    return true
  } catch (e) {
    modelError = e instanceof Error ? e.message : 'Model load failed'
    return false
  } finally {
    modelLoading = false
  }
}

export function getPushupModelStatus(): { loaded: boolean; error: string | null } {
  return { loaded: !!model, error: modelError }
}

export async function classifyPushupForm(flat: Float32Array): Promise<ClassificationResult> {
  if (!model) {
    const ok = await loadPushupModel()
    if (!ok || !model) return { label: 'UNKNOWN', confidence: 0, probabilities: [] }
  }

  const tf = await import('@tensorflow/tfjs')
  const input = tf.tensor3d(Array.from(flat), [1, TARGET_FRAMES, FEATURES_PER_FRAME])

  try {
    const output = model.predict(input) as Tensor
    const probs = Array.from(await output.data())
    output.dispose()

    const goodProb = probs[0] ?? 0
    const badProb  = probs[1] ?? 0
    const label: FormLabel = goodProb >= badProb ? 'GOOD_FORM' : 'BAD_FORM'
    return { label, confidence: Math.max(goodProb, badProb), probabilities: probs }
  } finally {
    input.dispose()
  }
}

export const PUSHUP_FORM_LABELS: Record<FormLabel, string> = {
  GOOD_FORM: 'Formă Bună ✓',
  BAD_FORM:  'Corectează Forma ⚠️',
  UNKNOWN:   'Analizând...',
}

export const PUSHUP_FORM_COLORS: Record<FormLabel, string> = {
  GOOD_FORM: '#1ED75F',
  BAD_FORM:  '#EF4444',
  UNKNOWN:   '#6B7280',
}
