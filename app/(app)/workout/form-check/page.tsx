'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, CameraOff, RefreshCw, Zap, ChevronRight, Video } from 'lucide-react'
import {
  RepCounter, STATE_LABELS, STATE_COLORS,
  PushupCounter, PUSHUP_STATE_LABELS,
  SquatCounter, SQUAT_STATE_LABELS,
} from '@/lib/ml/rep-counter'
import { preprocessFrameBuffer, preprocessPushupFrameBuffer } from '@/lib/ml/pose-preprocessor'
import { avgElbowAngle, squatDepthAngle, MP, extractBodyRiseMetrics } from '@/lib/ml/pose-math'
import { classifyForm, loadModel, FORM_LABELS, FORM_COLORS, getModelStatus } from '@/lib/ml/pullup-classifier'
import { classifyPushupForm, loadPushupModel, PUSHUP_FORM_LABELS, PUSHUP_FORM_COLORS, getPushupModelStatus } from '@/lib/ml/pushup-classifier'
import type { PushupFormLabel } from '@/lib/ml/pushup-classifier'
import { PULLUP_NORM_PARAMS, PUSHUP_NORM_PARAMS } from '@/lib/ml/normalization'
import type { FormLabel } from '@/lib/ml/pullup-classifier'
import type { RepState } from '@/lib/ml/rep-counter'
import type { Landmark } from '@/lib/ml/pose-math'
import { FormCoach } from '@/lib/ml/form-coach'
import type { FormCue } from '@/lib/ml/form-coach'
import { drawSkeleton } from '@/lib/ml/skeleton-draw'

// MediaPipe pose landmarker model — loaded from Google's CDN so no local file
// is required. The `connect-src *.googleapis.com` CSP directive covers this.
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

// ── Exercise types ─────────────────────────────────────────────────────────────

type ExerciseType = 'pullup' | 'pushup' | 'squat'

const EXERCISE_OPTIONS: { type: ExerciseType; label: string; emoji: string; hint: string }[] = [
  { type: 'pullup', label: 'Tracțiuni', emoji: '🏋️', hint: 'Cameră în față sau lateral. Bara trebuie să fie vizibilă.' },
  { type: 'pushup', label: 'Flotări', emoji: '💪', hint: 'Cameră lateral. Corpul trebuie să fie orizontal.' },
  { type: 'squat', label: 'Squaturi', emoji: '🦵', hint: 'Cameră lateral. Genunchii și șoldurile trebuie să fie vizibile.' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = 'select' | 'idle' | 'loading' | 'running' | 'error'
type VideoStatus = 'idle' | 'loading' | 'processing' | 'done' | 'error'

interface RepResult {
  repNumber: number
  landmarks: Landmark[][]
  label: FormLabel | PushupFormLabel | null
  confidence: number
  classifying: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FormCheckPage() {
  const router = useRouter()

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number | null>(null)

  // Video upload refs
  const uploadVideoRef = useRef<HTMLVideoElement>(null)
  const offscreenCanvasRef = useRef<HTMLCanvasElement>(null)
  const processingCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ML refs (shared between camera and video modes) — timing disabled
  // because the same counters are used for video upload frame-by-frame processing
  const repCounterRef = useRef(new RepCounter(undefined, false))
  const pushupCounterRef = useRef(new PushupCounter(undefined, false))
  const squatCounterRef = useRef(new SquatCounter(undefined, false))
  const formCoachRef = useRef(new FormCoach())
  const frameBufferRef = useRef<Landmark[][]>([])
  const detectorRef = useRef<unknown>(null)
  const lastHapticRepRef = useRef(0)

  // Camera mode state
  const [exerciseType, setExerciseType] = useState<ExerciseType>('pullup')
  const [status, setStatus] = useState<Status>('select')
  const [error, setError] = useState('')
  const [repCount, setRepCount] = useState(0)
  const [repState, setRepState] = useState<RepState>('IDLE')
  const [primaryAngle, setPrimaryAngle] = useState(0)
  const [formLabel, setFormLabel] = useState<FormLabel | PushupFormLabel>('UNKNOWN')
  const [formConfidence, setFormConfidence] = useState(0)
  const [modelReady, setModelReady] = useState(false)
  const [pushupModelReady, setPushupModelReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [classifying, setClassifying] = useState(false)
  const [stateLabel, setStateLabel] = useState('Pregătire...')
  const [stateColor, setStateColor] = useState('#6B7280')
  const [formCues, setFormCues] = useState<FormCue[]>([])

  // Video upload mode state
  const [videoMode, setVideoMode] = useState(false)
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('idle')
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoRepResults, setVideoRepResults] = useState<RepResult[]>([])
  const [videoError, setVideoError] = useState('')

  // ── Camera helpers ───────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStatus('idle')
  }, [])

  const runClassification = useCallback(async () => {
    const ready = exerciseType === 'pullup' ? modelReady : pushupModelReady
    if (!ready || classifying || frameBufferRef.current.length < 10) return
    setClassifying(true)
    try {
      const flat = exerciseType === 'pullup'
        ? preprocessFrameBuffer(frameBufferRef.current, PULLUP_NORM_PARAMS)
        : preprocessPushupFrameBuffer(frameBufferRef.current, PUSHUP_NORM_PARAMS)
      const result = exerciseType === 'pullup'
        ? await classifyForm(flat)
        : await classifyPushupForm(flat)
      setFormLabel(result.label)
      setFormConfidence(Math.round(result.confidence * 100))
    } finally {
      setClassifying(false)
    }
  }, [exerciseType, modelReady, pushupModelReady, classifying])

  const startCamera = useCallback(async () => {
    setStatus('loading')
    setError('')
    repCounterRef.current.reset()
    pushupCounterRef.current.reset()
    squatCounterRef.current.reset()
    formCoachRef.current.reset()
    frameBufferRef.current = []
    setRepCount(0)
    setRepState('IDLE')
    setFormLabel('UNKNOWN')
    setFormCues([])

    try {
      const [pullupOk, pushupOk] = await Promise.all([
        loadModel(),
        loadPushupModel(),
      ])
      setModelReady(pullupOk)
      setPushupModelReady(pushupOk)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const { createPoseLandmarker } = await import('@/lib/ml/create-pose-landmarker')
      detectorRef.current = await createPoseLandmarker(POSE_MODEL_URL)

      setStatus('running')

      let lastTime = -1
      function detect(time: number) {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        ctx.drawImage(video, 0, 0)

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          const result = (detectorRef.current as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] } }).detectForVideo(video, time)

          if (result.landmarks.length > 0) {
            const lms = result.landmarks[0]

            if (exerciseType === 'pullup') {
              const skeletonColor = STATE_COLORS[repState] ?? '#1ED75F'
              drawSkeleton(ctx, lms, canvas.width, canvas.height, skeletonColor)
              const elbow = avgElbowAngle(
                lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
                lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
              )
              const bodyMetrics = extractBodyRiseMetrics(lms)
              const counterState = repCounterRef.current.update(elbow, bodyMetrics)
              if (counterState.repCount > lastHapticRepRef.current) {
                lastHapticRepRef.current = counterState.repCount
                navigator.vibrate?.(30)
                runClassification()
              }
              setRepCount(counterState.repCount)
              setRepState(counterState.state)
              setPrimaryAngle(Math.round(elbow))
              setStateLabel(STATE_LABELS[counterState.state])
              setStateColor(STATE_COLORS[counterState.state])
              setFormCues(formCoachRef.current.getFormCues(lms, 'pullup', counterState.state, counterState.bodyRiseRejected))
              frameBufferRef.current.push(lms)
              if (frameBufferRef.current.length > 150) frameBufferRef.current.shift()
            } else if (exerciseType === 'pushup') {
              drawSkeleton(ctx, lms, canvas.width, canvas.height, '#F97316')
              const elbow = avgElbowAngle(
                lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
                lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
              )
              const counterState = pushupCounterRef.current.update(elbow)
              if (counterState.repCount > lastHapticRepRef.current) {
                lastHapticRepRef.current = counterState.repCount
                navigator.vibrate?.(30)
                runClassification()
              }
              setRepCount(counterState.repCount)
              setPrimaryAngle(Math.round(elbow))
              setStateLabel(PUSHUP_STATE_LABELS[counterState.state])
              setStateColor(counterState.state === 'UP' ? '#1ED75F' : counterState.state === 'DOWN' ? '#F59E0B' : '#6B7280')
              setFormCues(formCoachRef.current.getFormCues(lms, 'pushup', counterState.state))
              frameBufferRef.current.push(lms)
              if (frameBufferRef.current.length > 150) frameBufferRef.current.shift()
            } else {
              drawSkeleton(ctx, lms, canvas.width, canvas.height, '#3B82F6')
              const knee = squatDepthAngle(
                lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
                lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE],
                lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER],
              )
              const counterState = squatCounterRef.current.update(knee)
              if (counterState.repCount > lastHapticRepRef.current) {
                lastHapticRepRef.current = counterState.repCount
                navigator.vibrate?.(30)
              }
              setRepCount(counterState.repCount)
              setPrimaryAngle(Math.round(knee))
              setStateLabel(SQUAT_STATE_LABELS[counterState.state])
              setStateColor(counterState.state === 'UP' ? '#1ED75F' : counterState.state === 'DOWN' ? '#F59E0B' : '#6B7280')
              setFormCues(formCoachRef.current.getFormCues(lms, 'squat', counterState.state))
            }
          }
        }

        animRef.current = requestAnimationFrame(detect)
      }

      animRef.current = requestAnimationFrame(detect)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Eroare cameră'
      setError(msg)
      setStatus('error')
    }
  }, [facingMode, repState, exerciseType, runClassification])

  useEffect(() => {
    return stopCamera
  }, [stopCamera])

  function flipCamera() {
    stopCamera()
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  // ── Video upload helpers ─────────────────────────────────────────────────────

  function updateRepResult(index: number, patch: Partial<RepResult>) {
    setVideoRepResults(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  async function processUploadedVideo(file: File) {
    if (!file.type.startsWith('video/')) {
      setVideoError('Fișier invalid. Selectează un fișier video.')
      setVideoStatus('error')
      return
    }

    setVideoError('')
    setVideoRepResults([])
    setVideoProgress(0)
    setVideoStatus('loading')

    try {
      // A. Init IMAGE-mode PoseLandmarker
      const { createPoseLandmarker } = await import('@/lib/ml/create-pose-landmarker')
      const poseLandmarker = await createPoseLandmarker(POSE_MODEL_URL, 'IMAGE')

      // Load classifiers concurrently
      const [pullupOk, pushupOk] = await Promise.all([loadModel(), loadPushupModel()])
      setModelReady(pullupOk)
      setPushupModelReady(pushupOk)

      // B. Attach file to hidden video element
      const url = URL.createObjectURL(file)
      const video = uploadVideoRef.current!
      video.src = url
      await new Promise<void>(resolve => video.addEventListener('loadedmetadata', () => resolve(), { once: true }))

      const offCanvas = offscreenCanvasRef.current!
      offCanvas.width = video.videoWidth || 640
      offCanvas.height = video.videoHeight || 480
      const offCtx = offCanvas.getContext('2d')!

      const procCanvas = processingCanvasRef.current
      if (procCanvas) {
        procCanvas.width = offCanvas.width
        procCanvas.height = offCanvas.height
      }

      setVideoStatus('processing')

      // C. Frame scrubbing loop at 30fps
      const FPS = 30
      const totalFrames = Math.ceil(video.duration * FPS)

      const allLandmarks: Landmark[][] = []
      const repBoundaries: { start: number; end: number }[] = []
      let lastRepCount = 0
      let repFrameStart = 0

      repCounterRef.current.reset()
      pushupCounterRef.current.reset()
      squatCounterRef.current.reset()

      // Skeleton color for preview
      const skeletonColor = exerciseType === 'pullup' ? '#1ED75F'
        : exerciseType === 'pushup' ? '#F97316'
        : '#3B82F6'

      for (let fi = 0; fi < totalFrames; fi++) {
        video.currentTime = fi / FPS
        await new Promise<void>(resolve => video.addEventListener('seeked', () => resolve(), { once: true }))

        offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

        const result = (poseLandmarker as { detect: (c: HTMLCanvasElement) => { landmarks: Landmark[][] } }).detect(offCanvas)
        const lms: Landmark[] = result.landmarks[0] ?? []
        allLandmarks.push(lms)

        if (lms.length > 0) {
          // Draw skeleton preview
          if (procCanvas) {
            const pCtx = procCanvas.getContext('2d')!
            pCtx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height)
            drawSkeleton(pCtx, lms, procCanvas.width, procCanvas.height, skeletonColor)
          }

          // Rep counting
          const angle = exerciseType === 'squat'
            ? squatDepthAngle(
                lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
                lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE],
                lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER],
              )
            : avgElbowAngle(
                lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
                lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
              )

          const counter = exerciseType === 'pullup' ? repCounterRef.current
            : exerciseType === 'pushup' ? pushupCounterRef.current
            : squatCounterRef.current
          const cs = counter.update(angle)

          if (cs.repCount > lastRepCount) {
            repBoundaries.push({ start: repFrameStart, end: fi })
            repFrameStart = fi + 1
            lastRepCount = cs.repCount
          }
        }

        setVideoProgress(Math.round(((fi + 1) / totalFrames) * 100))
      }

      URL.revokeObjectURL(url)
      video.src = ''

      // D. Build initial results list
      const initialResults: RepResult[] = repBoundaries.map((b, i) => ({
        repNumber: i + 1,
        landmarks: allLandmarks.slice(b.start, b.end + 1).filter(f => f.length > 0),
        label: null,
        confidence: 0,
        classifying: exerciseType !== 'squat',
      }))
      setVideoRepResults(initialResults)
      setVideoStatus('done')

      // E. Classify each rep sequentially
      if (exerciseType !== 'squat') {
        for (let i = 0; i < initialResults.length; i++) {
          const frames = initialResults[i].landmarks
          if (frames.length < 5) {
            updateRepResult(i, { label: 'UNKNOWN' as FormLabel, confidence: 0, classifying: false })
            continue
          }
          try {
            const flat = exerciseType === 'pullup'
              ? preprocessFrameBuffer(frames, PULLUP_NORM_PARAMS)
              : preprocessPushupFrameBuffer(frames, PUSHUP_NORM_PARAMS)
            const res = exerciseType === 'pullup'
              ? await classifyForm(flat)
              : await classifyPushupForm(flat)
            updateRepResult(i, { label: res.label, confidence: res.confidence, classifying: false })
          } catch {
            updateRepResult(i, { label: 'UNKNOWN' as FormLabel, confidence: 0, classifying: false })
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Eroare la procesarea videoclipului'
      setVideoError(msg)
      setVideoStatus('error')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processUploadedVideo(file)
    e.target.value = ''
  }

  function resetVideoMode() {
    setVideoStatus('idle')
    setVideoRepResults([])
    setVideoProgress(0)
    setVideoError('')
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const formColor = exerciseType === 'pushup'
    ? PUSHUP_FORM_COLORS[formLabel as PushupFormLabel] ?? '#6B7280'
    : FORM_COLORS[formLabel as FormLabel] ?? '#6B7280'

  const exOpt = EXERCISE_OPTIONS.find(o => o.type === exerciseType)!
  const angleLabel = exerciseType === 'squat' ? 'Unghi genunchi' : 'Unghi cot'

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Always-mounted hidden utility elements for video mode */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <video ref={uploadVideoRef} className="hidden" playsInline muted crossOrigin="anonymous" />
      <canvas ref={offscreenCanvasRef} className="hidden" />

      {/* ── Select screen ─────────────────────────────────────────────────── */}
      {status === 'select' && (
        <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
          <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => router.back()}
                className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
                <ArrowLeft size={18} className="text-white/80" />
              </button>
              <h1 className="text-lg font-black text-white">Analiză Formă</h1>
            </div>

            {/* Mode toggle */}
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">MOD ANALIZĂ</p>
            <div className="flex gap-2 mb-5 p-1 rounded-2xl" style={{ backgroundColor: 'var(--app-surface)' }}>
              <button
                onClick={() => setVideoMode(false)}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-bold transition-all ${
                  !videoMode
                    ? 'bg-brand-green text-black shadow'
                    : 'text-white/50'
                }`}
              >
                <Camera size={14} />
                Camera Live
              </button>
              <button
                onClick={() => setVideoMode(true)}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-bold transition-all ${
                  videoMode
                    ? 'bg-brand-green text-black shadow'
                    : 'text-white/50'
                }`}
              >
                <Video size={14} />
                Videoclip
              </button>
            </div>

            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3">ALEGE EXERCIȚIUL</p>
            <div className="flex flex-col gap-3">
              {EXERCISE_OPTIONS.map(opt => {
                const isSquatVideoMode = videoMode && opt.type === 'squat'
                return (
                  <button
                    key={opt.type}
                    onClick={isSquatVideoMode ? undefined : () => {
                      setExerciseType(opt.type)
                      resetVideoMode()
                      setStatus('idle')
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-colors text-left ${
                      isSquatVideoMode
                        ? 'border-white/5 opacity-50 cursor-not-allowed'
                        : exerciseType === opt.type
                          ? 'border-brand-green/50 bg-brand-green/10'
                          : 'border-white/10 hover:bg-white/5'
                    }`}
                    style={{ backgroundColor: (!isSquatVideoMode && exerciseType === opt.type) ? undefined : 'var(--app-surface)' }}
                  >
                    <span className="text-3xl flex-shrink-0">{opt.emoji}</span>
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm">{opt.label}</p>
                      <p className="text-xs text-white/45 mt-0.5">{opt.hint}</p>
                    </div>
                    {isSquatVideoMode ? (
                      <span className="text-[10px] font-bold text-white/30 border border-white/20 rounded-full px-2 py-0.5 flex-shrink-0">
                        În curând
                      </span>
                    ) : (
                      <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Video upload screen ────────────────────────────────────────────── */}
      {status !== 'select' && videoMode && (
        <div className="flex flex-col min-h-[calc(100vh-64px)]" style={{ backgroundColor: '#0D1B1A' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
            <button
              onClick={() => { setStatus('select'); resetVideoMode() }}
              className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center"
            >
              <ArrowLeft size={18} className="text-white/80" />
            </button>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-base">{exOpt.emoji}</span>
              <h1 className="text-base font-black text-white">{exOpt.label}</h1>
            </div>
            <span className="text-xs font-bold text-white/30 border border-white/20 rounded-full px-2 py-0.5">
              Videoclip
            </span>
          </div>

          {/* Body */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* idle — file picker */}
            {videoStatus === 'idle' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
                <div className="w-20 h-20 rounded-full bg-brand-green/20 flex items-center justify-center">
                  <Video size={32} className="text-brand-green" />
                </div>
                <div>
                  <p className="text-white font-black text-lg">{exOpt.label} — Analiză din Videoclip</p>
                  <p className="text-white/45 text-sm mt-1 leading-relaxed">
                    Selectează un videoclip înregistrat de tine. Fiecare repetare va fi analizată individual.
                  </p>
                </div>
                <p className="text-xs text-white/30 -mt-2">{exOpt.hint}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-12 px-8 rounded-full bg-brand-green text-black font-black text-base"
                >
                  Alege Videoclip
                </button>
              </div>
            )}

            {/* loading — initializing MediaPipe */}
            {videoStatus === 'loading' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                <p className="text-white/60 text-sm">Se inițializează detectorul...</p>
              </div>
            )}

            {/* processing — skeleton preview + progress */}
            {videoStatus === 'processing' && (
              <div className="flex-1 flex flex-col">
                <div className="relative flex-1 bg-black overflow-hidden">
                  <canvas
                    ref={processingCanvasRef}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/60">
                    <p className="text-white/70 text-xs font-bold tracking-widest">SE ANALIZEAZĂ...</p>
                  </div>
                </div>
                <div className="px-4 py-4 flex-shrink-0" style={{ backgroundColor: '#0D1B1A' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-white/50">Progres</span>
                    <span className="text-xs font-bold text-brand-green">{videoProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-green transition-all duration-200"
                      style={{ width: `${videoProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/35 mt-2 text-center">
                    MediaPipe procesează cadru cu cadru — durează câteva minute
                  </p>
                </div>
              </div>
            )}

            {/* done — per-rep results */}
            {videoStatus === 'done' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-3 flex-shrink-0">
                  <p className="text-[10px] font-bold text-white/35 tracking-widest">
                    {videoRepResults.length === 0
                      ? 'NICIO REPETARE DETECTATĂ'
                      : `${videoRepResults.length} REPETĂRI DETECTATE`}
                  </p>
                </div>

                {videoRepResults.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-4xl">🤔</p>
                    <p className="text-white font-bold">Nicio repetare detectată</p>
                    <p className="text-white/45 text-sm leading-relaxed">
                      Asigură-te că corpul este vizibil în cadru și că luminozitatea este suficientă.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
                    {videoRepResults.map((rep) => {
                      const isSquat = exerciseType === 'squat'
                      const repFormColor = exerciseType === 'pushup'
                        ? PUSHUP_FORM_COLORS[rep.label as PushupFormLabel] ?? '#6B7280'
                        : FORM_COLORS[rep.label as FormLabel] ?? '#6B7280'

                      return (
                        <div
                          key={rep.repNumber}
                          className="flex items-center gap-3 p-4 rounded-2xl border border-white/8"
                          style={{ backgroundColor: 'var(--app-surface)' }}
                        >
                          <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-black text-white">{rep.repNumber}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-white/40 font-bold">Rep {rep.repNumber}</p>
                            <p className="text-xs text-white/25">{rep.landmarks.length} cadre</p>
                          </div>
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            {isSquat || rep.label === null && !rep.classifying ? (
                              <>
                                <span className="px-2 py-1 rounded-lg text-xs font-bold text-white/40 bg-white/8">
                                  Analiză indisponibilă
                                </span>
                                {isSquat && (
                                  <span className="text-[10px] text-white/25">În curând</span>
                                )}
                              </>
                            ) : rep.classifying ? (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 border border-brand-green border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-white/50">Analizez...</span>
                              </div>
                            ) : (
                              <>
                                <span
                                  className="px-2 py-1 rounded-lg text-xs font-bold"
                                  style={{
                                    backgroundColor: `${repFormColor}22`,
                                    color: repFormColor,
                                    border: `1px solid ${repFormColor}44`,
                                  }}
                                >
                                  {exerciseType === 'pullup'
                                    ? FORM_LABELS[rep.label as FormLabel]
                                    : PUSHUP_FORM_LABELS[rep.label as PushupFormLabel]}
                                </span>
                                <span className="text-[10px] text-white/30">
                                  {Math.round(rep.confidence * 100)}% încredere
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* error */}
            {videoStatus === 'error' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-red-400 font-semibold text-sm">⚠️ {videoError}</p>
                <button
                  onClick={resetVideoMode}
                  className="h-10 px-5 rounded-full bg-brand-green text-black font-bold text-sm"
                >
                  Încearcă din nou
                </button>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          {(videoStatus === 'done' || videoStatus === 'error') && (
            <div className="flex-shrink-0 px-4 py-4 flex gap-3" style={{ backgroundColor: '#0D1B1A' }}>
              <button
                onClick={() => { setStatus('select'); resetVideoMode() }}
                className="h-12 px-5 rounded-2xl font-bold text-sm border border-white/15 text-white/60"
              >
                Înapoi
              </button>
              <button
                onClick={() => { resetVideoMode(); fileInputRef.current?.click() }}
                className="flex-1 h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border border-brand-green/40 text-brand-green"
              >
                <Video size={15} />
                Alt videoclip
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Camera screen ──────────────────────────────────────────────────── */}
      {status !== 'select' && !videoMode && (
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
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover"
              style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined} muted playsInline />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover"
              style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined} />

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

                {/* Real-time form cue banners */}
                {formCues.length > 0 && (
                  <div className="absolute bottom-16 left-4 right-4 flex flex-col gap-1.5">
                    {formCues.map(cue => (
                      <div
                        key={cue.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{
                          backgroundColor: cue.severity === 'error' ? 'rgba(239,68,68,0.88)' : 'rgba(245,158,11,0.88)',
                          border: `1px solid ${cue.severity === 'error' ? '#ef444480' : '#f59e0b80'}`,
                        }}
                      >
                        <span className="text-white text-xs font-bold leading-tight">{cue.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="absolute bottom-4 left-4 flex flex-col">
                  <span className="text-xs text-white/40 mb-0.5">{angleLabel}</span>
                  <span className="text-2xl font-black text-white tabular-nums">{primaryAngle}°</span>
                </div>

                {(exerciseType === 'pullup' || exerciseType === 'pushup') && formLabel !== 'UNKNOWN' && (
                  <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl"
                    style={{ backgroundColor: `${formColor}33`, border: `1px solid ${formColor}66` }}>
                    <p className="text-xs font-bold" style={{ color: formColor }}>
                      {exerciseType === 'pullup'
                        ? FORM_LABELS[formLabel as FormLabel]
                        : PUSHUP_FORM_LABELS[formLabel as PushupFormLabel]}
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
                {(exerciseType === 'pullup' || exerciseType === 'pushup') && (
                  <button
                    onClick={runClassification}
                    disabled={(exerciseType === 'pullup' ? !modelReady : !pushupModelReady) || classifying || frameBufferRef.current.length < 10}
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

          {((exerciseType === 'pullup' && !modelReady && getModelStatus().error) ||
            (exerciseType === 'pushup' && !pushupModelReady && getPushupModelStatus().error)) && (
            <div className="px-4 pb-3">
              <p className="text-xs text-yellow-400/70 text-center">
                ⚠️ Modelul de clasificare nu a putut fi încărcat — numărarea rep-urilor funcționează, feedback-ul AI nu.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
