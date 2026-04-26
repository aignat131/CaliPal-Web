'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, CameraOff, RefreshCw, Zap, ChevronRight } from 'lucide-react'
import {
  RepCounter, STATE_LABELS, STATE_COLORS,
  PushupCounter, PUSHUP_STATE_LABELS,
  SquatCounter, SQUAT_STATE_LABELS,
} from '@/lib/ml/rep-counter'
import { extractFeatures } from '@/lib/ml/pose-preprocessor'
import { avgElbowAngle, avgKneeAngle, MP } from '@/lib/ml/pose-math'
import { preprocessFrameBuffer } from '@/lib/ml/pose-preprocessor'
import { classifyForm, loadModel, FORM_LABELS, FORM_COLORS, getModelStatus } from '@/lib/ml/pullup-classifier'
import type { FormLabel } from '@/lib/ml/pullup-classifier'
import type { RepState } from '@/lib/ml/rep-counter'
import type { Landmark } from '@/lib/ml/pose-math'

// ── Skeleton drawing ──────────────────────────────────────────────────────────

const POSE_CONNECTIONS = [
  [MP.LEFT_SHOULDER, MP.RIGHT_SHOULDER],
  [MP.LEFT_SHOULDER, MP.LEFT_ELBOW],
  [MP.LEFT_ELBOW, MP.LEFT_WRIST],
  [MP.RIGHT_SHOULDER, MP.RIGHT_ELBOW],
  [MP.RIGHT_ELBOW, MP.RIGHT_WRIST],
  [MP.LEFT_SHOULDER, MP.LEFT_HIP],
  [MP.RIGHT_SHOULDER, MP.RIGHT_HIP],
  [MP.LEFT_HIP, MP.RIGHT_HIP],
  [MP.LEFT_HIP, MP.LEFT_KNEE],
  [MP.RIGHT_HIP, MP.RIGHT_KNEE],
  [MP.LEFT_KNEE, MP.LEFT_ANKLE],
  [MP.RIGHT_KNEE, MP.RIGHT_ANKLE],
]

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  color: string
) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = landmarks[a]
    const lb = landmarks[b]
    if (!la || !lb || (la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.moveTo(la.x * w, la.y * h)
    ctx.lineTo(lb.x * w, lb.y * h)
    ctx.stroke()
  }
  for (const lm of landmarks) {
    if ((lm.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

// ── Exercise types ─────────────────────────────────────────────────────────────

type ExerciseType = 'pullup' | 'pushup' | 'squat'

const EXERCISE_OPTIONS: { type: ExerciseType; label: string; emoji: string; hint: string }[] = [
  { type: 'pullup', label: 'Tracțiuni', emoji: '🏋️', hint: 'Cameră în față sau lateral. Bara trebuie să fie vizibilă.' },
  { type: 'pushup', label: 'Flotări', emoji: '💪', hint: 'Cameră lateral. Corpul trebuie să fie orizontal.' },
  { type: 'squat', label: 'Squaturi', emoji: '🦵', hint: 'Cameră lateral. Genunchii și șoldurile trebuie să fie vizibile.' },
]

// ── Component ─────────────────────────────────────────────────────────────────

type Status = 'select' | 'idle' | 'loading' | 'running' | 'error'

export default function FormCheckPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number | null>(null)
  const repCounterRef = useRef(new RepCounter())
  const pushupCounterRef = useRef(new PushupCounter())
  const squatCounterRef = useRef(new SquatCounter())
  const frameBufferRef = useRef<Landmark[][]>([])
  const detectorRef = useRef<unknown>(null)

  const [exerciseType, setExerciseType] = useState<ExerciseType>('pullup')
  const [status, setStatus] = useState<Status>('select')
  const [error, setError] = useState('')
  const [repCount, setRepCount] = useState(0)
  const [repState, setRepState] = useState<RepState>('IDLE')
  const [primaryAngle, setPrimaryAngle] = useState(0)
  const [formLabel, setFormLabel] = useState<FormLabel>('UNKNOWN')
  const [formConfidence, setFormConfidence] = useState(0)
  const [modelReady, setModelReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [classifying, setClassifying] = useState(false)
  const [stateLabel, setStateLabel] = useState('Pregătire...')
  const [stateColor, setStateColor] = useState('#6B7280')

  useEffect(() => {
    loadModel().then(ok => setModelReady(ok))
  }, [])

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStatus('idle')
  }, [])

  const startCamera = useCallback(async () => {
    setStatus('loading')
    setError('')
    repCounterRef.current.reset()
    pushupCounterRef.current.reset()
    squatCounterRef.current.reset()
    frameBufferRef.current = []
    setRepCount(0)
    setRepState('IDLE')
    setFormLabel('UNKNOWN')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const vision = await import('@mediapipe/tasks-vision')
      const { PoseLandmarker, FilesetResolver } = vision

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )
      const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: '/models/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      detectorRef.current = poseLandmarker

      setStatus('running')

      let lastTime = -1
      function detect(time: number) {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        ctx.save()
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(video, 0, 0)
        ctx.restore()

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          const result = (poseLandmarker as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] } }).detectForVideo(video, time)

          if (result.landmarks.length > 0) {
            const lms = result.landmarks[0]

            if (exerciseType === 'pullup') {
              const skeletonColor = STATE_COLORS[repState] ?? '#1ED75F'
              drawSkeleton(ctx, lms, canvas.width, canvas.height, skeletonColor)
              const features = extractFeatures(lms)
              const elbow = avgElbowAngle(
                lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
                lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
              )
              const counterState = repCounterRef.current.update(elbow)
              setRepCount(counterState.repCount)
              setRepState(counterState.state)
              setPrimaryAngle(Math.round(elbow))
              setStateLabel(STATE_LABELS[counterState.state])
              setStateColor(STATE_COLORS[counterState.state])
              frameBufferRef.current.push(lms)
              if (frameBufferRef.current.length > 150) frameBufferRef.current.shift()
              void features
            } else if (exerciseType === 'pushup') {
              drawSkeleton(ctx, lms, canvas.width, canvas.height, '#F97316')
              const elbow = avgElbowAngle(
                lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
                lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
              )
              const counterState = pushupCounterRef.current.update(elbow)
              setRepCount(counterState.repCount)
              setPrimaryAngle(Math.round(elbow))
              setStateLabel(PUSHUP_STATE_LABELS[counterState.state])
              setStateColor(counterState.state === 'UP' ? '#1ED75F' : counterState.state === 'DOWN' ? '#F59E0B' : '#6B7280')
            } else {
              drawSkeleton(ctx, lms, canvas.width, canvas.height, '#3B82F6')
              const knee = avgKneeAngle(
                lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
                lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE]
              )
              const counterState = squatCounterRef.current.update(knee)
              setRepCount(counterState.repCount)
              setPrimaryAngle(Math.round(knee))
              setStateLabel(SQUAT_STATE_LABELS[counterState.state])
              setStateColor(counterState.state === 'UP' ? '#1ED75F' : counterState.state === 'DOWN' ? '#F59E0B' : '#6B7280')
            }
          }
        }

        animRef.current = requestAnimationFrame(detect)
      }

      animRef.current = requestAnimationFrame(detect)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Eroare cameră'
      setError(msg.includes('pose_landmarker')
        ? 'Modelul MediaPipe lipsește. Copiază pose_landmarker_lite.task în public/models/.'
        : msg)
      setStatus('error')
    }
  }, [facingMode, repState, exerciseType])

  useEffect(() => {
    return stopCamera
  }, [stopCamera])

  async function runClassification() {
    if (!modelReady || classifying || frameBufferRef.current.length < 10) return
    setClassifying(true)
    try {
      const flat = await preprocessFrameBuffer(frameBufferRef.current)
      const result = await classifyForm(flat)
      setFormLabel(result.label)
      setFormConfidence(Math.round(result.confidence * 100))
    } finally {
      setClassifying(false)
    }
  }

  function flipCamera() {
    stopCamera()
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  const formColor = FORM_COLORS[formLabel]

  // ── Exercise selector screen ─────────────────────────────────────────────────
  if (status === 'select') {
    return (
      <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.back()}
              className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
              <ArrowLeft size={18} className="text-white/80" />
            </button>
            <h1 className="text-lg font-black text-white">Analiză Formă</h1>
          </div>

          <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3">ALEGE EXERCIȚIUL</p>
          <div className="flex flex-col gap-3">
            {EXERCISE_OPTIONS.map(opt => (
              <button
                key={opt.type}
                onClick={() => { setExerciseType(opt.type); setStatus('idle') }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-colors text-left ${
                  exerciseType === opt.type
                    ? 'border-brand-green/50 bg-brand-green/10'
                    : 'border-white/10 hover:bg-white/5'
                }`}
                style={{ backgroundColor: exerciseType === opt.type ? undefined : 'var(--app-surface)' }}
              >
                <span className="text-3xl flex-shrink-0">{opt.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold text-white text-sm">{opt.label}</p>
                  <p className="text-xs text-white/45 mt-0.5">{opt.hint}</p>
                </div>
                <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Camera screen ─────────────────────────────────────────────────────────────
  const exOpt = EXERCISE_OPTIONS.find(o => o.type === exerciseType)!
  const angleLabel = exerciseType === 'squat' ? 'Unghi genunchi' : 'Unghi cot'

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]" style={{ backgroundColor: '#0D1B1A' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
        <button onClick={() => { stopCamera(); setStatus('select') }}
          className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
          <ArrowLeft size={18} className="text-white/80" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-base">{exOpt.emoji}</span>
          <h1 className="text-base font-black text-white">{exOpt.label}</h1>
        </div>
        {status === 'running' && (
          <button onClick={flipCamera}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <RefreshCw size={15} className="text-white/70" />
          </button>
        )}
      </div>

      {/* Camera view */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

        {status === 'running' && (
          <>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <span className="text-6xl font-black text-white tabular-nums" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
                {repCount}
              </span>
              <span className="text-xs font-bold text-white/60 tracking-widest">REPETĂRI</span>
            </div>

            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${stateColor}33`, border: `1px solid ${stateColor}66` }}>
              <span className="text-xs font-bold" style={{ color: stateColor }}>
                {stateLabel}
              </span>
            </div>

            <div className="absolute bottom-4 left-4 flex flex-col">
              <span className="text-xs text-white/40 mb-0.5">{angleLabel}</span>
              <span className="text-2xl font-black text-white tabular-nums">{primaryAngle}°</span>
            </div>

            {exerciseType === 'pullup' && formLabel !== 'UNKNOWN' && (
              <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl"
                style={{ backgroundColor: `${formColor}33`, border: `1px solid ${formColor}66` }}>
                <p className="text-xs font-bold" style={{ color: formColor }}>
                  {FORM_LABELS[formLabel]}
                </p>
                <p className="text-[10px] text-white/40 text-right">{formConfidence}%</p>
              </div>
            )}
          </>
        )}

        {status !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
            {status === 'error' ? (
              <div className="px-6 text-center">
                <p className="text-red-400 font-semibold text-sm mb-2">⚠️ {error}</p>
                <button onClick={startCamera}
                  className="h-10 px-5 rounded-full bg-brand-green text-black font-bold text-sm">
                  Încearcă din nou
                </button>
              </div>
            ) : status === 'loading' ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                <p className="text-white/60 text-sm">Se încarcă modelele...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-brand-green/20 flex items-center justify-center">
                  <Camera size={28} className="text-brand-green" />
                </div>
                <p className="text-white font-bold">{exOpt.label} — Analiză în timp real</p>
                <p className="text-white/45 text-sm">{exOpt.hint}</p>
                <button onClick={startCamera}
                  className="mt-2 h-12 px-8 rounded-full bg-brand-green text-black font-black text-base">
                  Pornește camera
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 px-4 py-4 flex gap-3" style={{ backgroundColor: '#0D1B1A' }}>
        {status === 'running' ? (
          <>
            {exerciseType === 'pullup' && (
              <button
                onClick={runClassification}
                disabled={!modelReady || classifying || frameBufferRef.current.length < 10}
                className="flex-1 h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border border-brand-green/40 text-brand-green disabled:opacity-40"
              >
                <Zap size={15} />
                {classifying ? 'Analizez...' : 'Analizează forma'}
              </button>
            )}
            <button onClick={stopCamera}
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-red-500/20 border border-red-500/30">
              <CameraOff size={18} className="text-red-400" />
            </button>
          </>
        ) : (
          <div className="flex-1 rounded-2xl p-3" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-xs font-bold text-white/40 tracking-widest mb-1">CUM FUNCȚIONEAZĂ</p>
            <p className="text-xs text-white/60 leading-relaxed">
              {exerciseType === 'pullup'
                ? 'Modelul MediaPipe detectează poziția corpului și numără repetările. Apasă "Analizează forma" pentru feedback AI.'
                : exerciseType === 'pushup'
                  ? 'Stai lateral față de cameră. Modelul detectează unghiul cotului și numără flotările automat.'
                  : 'Stai lateral față de cameră. Modelul detectează unghiul genunchiului și numără squaturile automat.'
              }
            </p>
          </div>
        )}
      </div>

      {exerciseType === 'pullup' && !modelReady && getModelStatus().error && (
        <div className="px-4 pb-3">
          <p className="text-xs text-yellow-400/70 text-center">
            ⚠️ Modelul de clasificare nu a putut fi încărcat — numărarea rep-urilor funcționează, feedback-ul AI nu.
          </p>
        </div>
      )}
    </div>
  )
}
