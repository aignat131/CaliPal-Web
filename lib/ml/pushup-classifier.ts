/**
 * Push-up form classifier.
 * Model input shape: [1, 90, 8]  (batch=1, frames=90, features=8)
 * Model output: softmax probabilities for form classes
 *
 * @tensorflow/tfjs-tflite is NOT bundled — see pullup-classifier.ts for details.
 */

import { TARGET_FRAMES, FEATURES_PER_FRAME } from './pose-preprocessor'

export type FormLabel = 'GOOD_FORM' | 'BAD_FORM' | 'UNKNOWN'

export interface ClassificationResult {
  label: FormLabel
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

export async function classifyPushupForm(flat: Float32Array): Promise<ClassificationResult> {
  if (!model) {
    const ok = await loadPushupModel()
    if (!ok || !model) return { label: 'UNKNOWN', confidence: 0, probabilities: [] }
  }

  const tf = await import('@tensorflow/tfjs')
  const input = tf.tensor(flat, [1, TARGET_FRAMES, FEATURES_PER_FRAME])

  try {
    const output = model!.predict(input) as import('@tensorflow/tfjs').Tensor
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
