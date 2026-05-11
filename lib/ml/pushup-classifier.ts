/**
 * Push-up form classifier.
 * Model input shape: [1, 90, 4]  (batch=1, frames=90, 4 raw angle features)
 * Model output: softmax probabilities for 5 form classes:
 *   0 — CORRECT
 *   1 — KNEES_TOO_LOW
 *   2 — HIPS_TOO_HIGH
 *   3 — UNCOMPLETED
 *   4 — SHOULDERS_FIRST
 */

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

type TFLiteLib = {
  setWasmPath: (path: string) => void
  loadTFLiteModel: (url: string) => Promise<{ predict: (t: unknown) => unknown }>
}

let model: { predict: (t: unknown) => unknown } | null = null
let modelLoading = false
let modelError: string | null = null

function getTFLite(): TFLiteLib | null {
  return (globalThis as Record<string, unknown>).tflite as TFLiteLib | null ?? null
}

export async function loadPushupModel(): Promise<boolean> {
  if (model) return true
  if (modelLoading) return false
  modelLoading = true

  try {
    const tflite = getTFLite()
    if (!tflite) throw new Error('TFLite runtime not loaded — call loadTFLiteRuntime() first')

    tflite.setWasmPath(
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/wasm/'
    )
    model = await tflite.loadTFLiteModel('/models/pushup_model.tflite')
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

  const tf = await import('@tensorflow/tfjs')
  const input = tf.tensor(flat, [1, TARGET_FRAMES, PUSHUP_FEATURES_PER_FRAME])

  try {
    const output = model!.predict(input) as import('@tensorflow/tfjs').Tensor
    const probs = Array.from(await output.data())
    output.dispose()

    const maxIdx = probs.indexOf(Math.max(...probs))
    const label = CLASS_LABELS[maxIdx] ?? 'UNKNOWN'

    return { label, confidence: probs[maxIdx] ?? 0, probabilities: probs }
  } finally {
    input.dispose()
  }
}

export const PUSHUP_FORM_LABELS: Record<PushupFormLabel, string> = {
  CORRECT:         'Formă Corectă ✓',
  KNEES_TOO_LOW:   'Genunchi prea jos ⚠️',
  HIPS_TOO_HIGH:   'Șolduri prea sus ⚠️',
  UNCOMPLETED:     'Repetare incompletă ⚠️',
  SHOULDERS_FIRST: 'Umeri în față ⚠️',
  UNKNOWN:         'Analizând...',
}

export const PUSHUP_FORM_COLORS: Record<PushupFormLabel, string> = {
  CORRECT:         '#1ED75F',
  KNEES_TOO_LOW:   '#F59E0B',
  HIPS_TOO_HIGH:   '#F97316',
  UNCOMPLETED:     '#EAB308',
  SHOULDERS_FIRST: '#EF4444',
  UNKNOWN:         '#6B7280',
}
