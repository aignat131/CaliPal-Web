/**
 * Push-up form classifier — TF.js GraphModel (converted from TFLite).
 * Input:  [1, 90, 4]  (batch=1, frames=90, 4 raw angle features)
 * Output: 5 logits — softmax applied here.
 * Classes: 0=CORRECT, 1=KNEES_TOO_LOW, 2=HIPS_TOO_HIGH, 3=UNCOMPLETED, 4=SHOULDERS_FIRST
 */

import * as tf from '@tensorflow/tfjs'
import { TARGET_FRAMES, PUSHUP_FEATURES_PER_FRAME } from './pose-preprocessor'

export type PushupFormLabel =
  | 'CORRECT'
  | 'KNEES_TOO_LOW'
  | 'HIPS_TOO_HIGH'
  | 'UNCOMPLETED'
  | 'SHOULDERS_FIRST'
  | 'UNKNOWN'

export interface PushupClassificationResult {
  label: PushupFormLabel
  confidence: number
  probabilities: number[]
}

let model: tf.GraphModel | null = null
let modelLoading = false
let modelError: string | null = null

export async function loadPushupModel(): Promise<boolean> {
  if (model) return true
  if (modelLoading) return false
  modelLoading = true
  try {
    model = await tf.loadGraphModel('/models/pushup_tfjs/model.json')
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

const CLASS_LABELS: PushupFormLabel[] = [
  'CORRECT',
  'KNEES_TOO_LOW',
  'HIPS_TOO_HIGH',
  'UNCOMPLETED',
  'SHOULDERS_FIRST',
]

export async function classifyPushupForm(flat: Float32Array): Promise<PushupClassificationResult> {
  if (!model) {
    const ok = await loadPushupModel()
    if (!ok || !model) return { label: 'UNKNOWN', confidence: 0, probabilities: [] }
  }

  const input = tf.tensor(flat, [1, TARGET_FRAMES, PUSHUP_FEATURES_PER_FRAME])
  try {
    const rawOutput = model!.predict(input) as tf.Tensor
    const probs = Array.from(await tf.softmax(rawOutput).data())
    rawOutput.dispose()

    const maxIdx = probs.indexOf(Math.max(...probs))
    const label  = CLASS_LABELS[maxIdx] ?? 'UNKNOWN'

    return { label, confidence: probs[maxIdx] ?? 0, probabilities: probs }
  } finally {
    input.dispose()
  }
}

export const PUSHUP_FORM_LABELS: Record<PushupFormLabel, string> = {
  CORRECT:         'Forma Corecta',
  KNEES_TOO_LOW:   'Genunchi prea jos',
  HIPS_TOO_HIGH:   'Solduri prea sus',
  UNCOMPLETED:     'Repetare incompleta',
  SHOULDERS_FIRST: 'Umeri in fata',
  UNKNOWN:         'Analizand...',
}

export const PUSHUP_FORM_COLORS: Record<PushupFormLabel, string> = {
  CORRECT:         '#1ED75F',
  KNEES_TOO_LOW:   '#F59E0B',
  HIPS_TOO_HIGH:   '#F97316',
  UNCOMPLETED:     '#EAB308',
  SHOULDERS_FIRST: '#EF4444',
  UNKNOWN:         '#6B7280',
}
