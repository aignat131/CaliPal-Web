/**
 * Pull-up form classifier — TF.js GraphModel (converted from TFLite).
 * Input:  [1, 90, 8]  (batch=1, frames=90, 8 features with velocities)
 * Output: logits [1, 5] — no softmax (identical to pushup for consistency;
 *         pullup TFLite had softmax but we apply it here instead)
 */

import * as tf from '@tensorflow/tfjs'
import { TARGET_FRAMES, FEATURES_PER_FRAME } from './pose-preprocessor'

export type FormLabel = 'GOOD_FORM' | 'BAD_FORM' | 'UNKNOWN'

export interface ClassificationResult {
  label: FormLabel
  confidence: number
  probabilities: number[]
}

let model: tf.GraphModel | null = null
let modelLoading = false
let modelError: string | null = null

export async function loadModel(): Promise<boolean> {
  if (model) return true
  if (modelLoading) return false
  modelLoading = true
  try {
    model = await tf.loadGraphModel('/models/pullup_tfjs/model.json')
    modelError = null
    return true
  } catch (e) {
    modelError = e instanceof Error ? e.message : 'Model load failed'
    return false
  } finally {
    modelLoading = false
  }
}

export function getModelStatus(): { loaded: boolean; error: string | null } {
  return { loaded: !!model, error: modelError }
}

export async function classifyForm(flat: Float32Array): Promise<ClassificationResult> {
  if (!model) {
    const ok = await loadModel()
    if (!ok || !model) return { label: 'UNKNOWN', confidence: 0, probabilities: [] }
  }

  const input = tf.tensor(flat, [1, TARGET_FRAMES, FEATURES_PER_FRAME])
  try {
    const result = await model!.executeAsync(input) as tf.Tensor
    const probs = Array.from(await tf.softmax(result).data() as Float32Array) as number[]
    result.dispose()

    const goodProb = probs[0] ?? 0
    const badProb  = probs[1] ?? 0
    const label: FormLabel = goodProb >= badProb ? 'GOOD_FORM' : 'BAD_FORM'

    return { label, confidence: Math.max(goodProb, badProb), probabilities: probs }
  } finally {
    input.dispose()
  }
}

export const FORM_LABELS: Record<FormLabel, string> = {
  GOOD_FORM: 'Forma Buna',
  BAD_FORM:  'Corecteaza Forma',
  UNKNOWN:   'Analizand...',
}

export const FORM_COLORS: Record<FormLabel, string> = {
  GOOD_FORM: '#1ED75F',
  BAD_FORM:  '#EF4444',
  UNKNOWN:   '#6B7280',
}
