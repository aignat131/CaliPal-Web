'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Check, FlipHorizontal2 } from 'lucide-react'
import {
  RepCounter, STATE_LABELS, STATE_COLORS,
  PushupCounter, PUSHUP_STATE_LABELS,
  SquatCounter, SQUAT_STATE_LABELS,
  BALANCED_PULLUP, EASY_PULLUP, STRICT_PULLUP, EASY_PUSHUP, BALANCED_SQUAT,
} from '@/lib/ml/rep-counter'
import type { PullupThresholds } from '@/lib/ml/rep-counter'
import type { RepState, PushupState, SquatState } from '@/lib/ml/rep-counter'
import { bestElbowAngle, bestElbowAngle2D, squatDepthAngle, MP, AngleSmoother, extractBodyRiseMetrics } from '@/lib/ml/pose-math'
import type { Landmark } from '@/lib/ml/pose-math'
import { FormCoach } from '@/lib/ml/form-coach'
import type { ExerciseType, FormCue } from '@/lib/ml/form-coach'
import { drawSkeleton, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'
import { renderVideoCover } from '@/lib/ml/video-render'
import { PoseValidator } from '@/lib/ml/pose-validator'
import { ExerciseDetector } from '@/lib/ml/exercise-detector'
import type { DetectorState } from '@/lib/ml/exercise-detector'
import type { UnifiedRepSession } from '@/types'

// keep linter happy
void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

export const UNIFIED_SESSION_KEY = 'calipal_unified_rep_session'

// ── Exercise metadata ────────────────────────────────────────────────────────

const EXERCISE_META: Record<ExerciseType, { name: string; emoji: string; color: string; skeletonColor: string }> = {
  pushup: { name: 'Flotări',   emoji: '💪', color: '#F97316', skeletonColor: '#F97316' },
  pullup: { name: 'Tracțiuni', emoji: '🏋️', color: '#1ED75F', skeletonColor: '#1ED75F' },
  squat:  { name: 'Squaturi',  emoji: '🦵', color: '#3B82F6', skeletonColor: '#3B82F6' },
}

const EXERCISE_TYPES: ExerciseType[] = ['pushup', 'pullup', 'squat']

// ── Pull-up difficulty presets ──────────────────────────────────────────────

type PullupDifficulty = 'easy' | 'balanced' | 'hard'

const PULLUP_PRESETS: Record<PullupDifficulty, { label: string; thresholds: PullupThresholds }> = {
  easy:     { label: 'Ușor',      thresholds: EASY_PULLUP },
  balanced: { label: 'Balansat',  thresholds: BALANCED_PULLUP },
  hard:     { label: 'Strict',    thresholds: STRICT_PULLUP },
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedResult {
  exercises: { type: ExerciseType; name: string; reps: number }[]
  durationSeconds: number
}

interface Props {
  onConfirm: (result: UnifiedResult) => void
  onCancel: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function UnifiedRepCounterModal({ onConfirm, onCancel }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const animRef    = useRef<number | null>(null)
  const detectorRef = useRef<{
    detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }
    close?: () => void
  } | null>(null)
  const lastHapticRef = useRef(0)

  // ── ML refs (stable across renders) ──────────────────────────────────────

  const exerciseDetectorRef = useRef(new ExerciseDetector())
  const pullupCounterRef    = useRef(new RepCounter(BALANCED_PULLUP))
  const pushupCounterRef    = useRef(new PushupCounter(EASY_PUSHUP))
  const squatCounterRef     = useRef(new SquatCounter(BALANCED_SQUAT))
  const formCoachRef        = useRef(new FormCoach())
  const poseValidatorRef    = useRef(new PoseValidator())

  const elbowSmootherRef   = useRef(new AngleSmoother(0.3))
  const elbowSmoother2DRef = useRef(new AngleSmoother(0.3)) // 2D angles for pull-ups (Z-depth unreliable)
  const kneeSmootherRef    = useRef(new AngleSmoother(0.3))

  // Rep counts for all exercises (ref for rAF loop, state for UI)
  const repCountsRef = useRef<Record<ExerciseType, number>>({ pushup: 0, pullup: 0, squat: 0 })
  const prevActiveExerciseRef = useRef<ExerciseType | null>(null)

  // Rep timing
  const firstRepTimestampRef = useRef<number | null>(null)
  const lastRepTimestampRef  = useRef<number | null>(null)

  // Pull-up difficulty
  const [pullupDifficulty, setPullupDifficulty] = useState<PullupDifficulty>('balanced')

  // Camera
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user')
  const [cameraLoading, setCameraLoading] = useState(false)

  // UI state
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState('')
  const [activeExercise, setActiveExercise] = useState<ExerciseType | null>(null)
  const [detectorState, setDetectorState]   = useState<DetectorState>('LOADING')
  const [repCounts, setRepCounts]           = useState<Record<ExerciseType, number>>({ pushup: 0, pullup: 0, squat: 0 })
  const [stateLabel, setStateLabel]         = useState('Pregătire...')
  const [stateColor, setStateColor]         = useState('#6B7280')
  const [formCues, setFormCues]             = useState<FormCue[]>([])
  const [poseInvalid, setPoseInvalid]       = useState<string | null>(null)

  const totalReps = repCounts.pushup + repCounts.pullup + repCounts.squat

  // ── localStorage crash backup ─────────────────────────────────────────────

  const saveSession = useCallback(() => {
    const counts = repCountsRef.current
    const hasReps = counts.pushup > 0 || counts.pullup > 0 || counts.squat > 0
    if (!hasReps) return
    const session: UnifiedRepSession = {
      exercises: EXERCISE_TYPES
        .filter(t => counts[t] > 0)
        .map(t => ({ type: t, name: EXERCISE_META[t].name, reps: counts[t] })),
      firstRepTimestamp: firstRepTimestampRef.current,
      lastRepTimestamp: lastRepTimestampRef.current,
      savedAt: Date.now(),
    }
    try { localStorage.setItem(UNIFIED_SESSION_KEY, JSON.stringify(session)) } catch { /* */ }
  }, [])

  useEffect(() => {
    const hasReps = totalReps > 0
    if (!hasReps) return
    const id = setInterval(saveSession, 2000)
    return () => clearInterval(id)
  }, [totalReps > 0, saveSession]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => saveSession()
    const visHandler = () => { if (document.visibilityState === 'hidden') saveSession() }
    window.addEventListener('beforeunload', handler)
    window.addEventListener('pagehide', handler)
    document.addEventListener('visibilitychange', visHandler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      window.removeEventListener('pagehide', handler)
      document.removeEventListener('visibilitychange', visHandler)
    }
  }, [saveSession])

  function clearSession() {
    try { localStorage.removeItem(UNIFIED_SESSION_KEY) } catch { /* */ }
  }

  // ── Camera lifecycle ──────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    try { detectorRef.current?.close?.() } catch { /* */ }
    detectorRef.current = null
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    elbowSmootherRef.current.reset()
    elbowSmoother2DRef.current.reset()
    kneeSmootherRef.current.reset()

    setCameraLoading(true)
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, zoom: 1 } as MediaTrackConstraints,
      })
      // Reset camera zoom to minimum to prevent device-level zoom
      const track = stream.getVideoTracks()[0]
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
      if (caps?.zoom) {
        const z = caps.zoom as { min: number }
        await track.applyConstraints({ advanced: [{ zoom: z.min } as MediaTrackConstraintSet] })
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      if (!detectorRef.current) {
        const { createPoseLandmarker } = await import('@/lib/ml/create-pose-landmarker')
        detectorRef.current = await createPoseLandmarker(POSE_MODEL_URL)
      }

      // Initialize exercise detector (loads all 3 position gate models)
      exerciseDetectorRef.current.initialize().then(() => {
        setDetectorState(exerciseDetectorRef.current.detectorState)
      })

      setLoading(false)
      setCameraLoading(false)

      let lastTime = -1
      function detect(time: number) {
        if (!videoRef.current || !canvasRef.current) return
        const video  = videoRef.current
        const canvas = canvasRef.current
        const ctx    = canvas.getContext('2d')!

        const dims = renderVideoCover(ctx, canvas, video)
        if (!dims) { animRef.current = requestAnimationFrame(detect); return }

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          if (!detectorRef.current) { animRef.current = requestAnimationFrame(detect); return }
          const result = detectorRef.current.detectForVideo(video, time)
          if (result.landmarks.length > 0) {
            processFrame(result.landmarks[0], ctx, dims.vw, dims.vh)
          }
        }
        animRef.current = requestAnimationFrame(detect)
      }
      animRef.current = requestAnimationFrame(detect)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      const name = e instanceof DOMException ? e.name : ''
      setError(name === 'NotAllowedError' ? 'Permite accesul la cameră pentru a continua' : msg || 'Eroare cameră')
      setLoading(false)
      setCameraLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      setError('')
      try {
        await startCamera('user')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Eroare cameră')
        setLoading(false)
      }
    }
    init()
    return () => { cancelled = true; stopCamera() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Frame processing ──────────────────────────────────────────────────────

  function processFrame(lms: Landmark[], ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Always compute both angles
    const rawElbow = bestElbowAngle(
      lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
      lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST],
    )
    // 2D elbow angle for pull-ups — ignores Z-depth noise from front-facing cameras
    const rawElbow2D = bestElbowAngle2D(
      lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
      lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST],
    )
    const rawKnee = squatDepthAngle(
      lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
      lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE],
      lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER],
    )
    const elbow   = elbowSmootherRef.current.smooth(rawElbow)
    const elbow2D = elbowSmoother2DRef.current.smooth(rawElbow2D)
    const knee    = kneeSmootherRef.current.smooth(rawKnee)

    // Exercise detection
    const detection = exerciseDetectorRef.current.update(lms)
    const active = detection.activeExercise
    setDetectorState(detection.state)

    // Handle exercise change — reset validator and form coach
    if (active !== prevActiveExerciseRef.current) {
      if (active) {
        poseValidatorRef.current.reset()
        formCoachRef.current.reset()
      }
      prevActiveExerciseRef.current = active
    }

    setActiveExercise(active)

    if (!active) {
      // No exercise detected — gray skeleton, detecting overlay
      drawSkeleton(ctx, lms, w, h, '#6B7280')
      setStateLabel('Detectare...')
      setStateColor('#6B7280')
      setFormCues([])
      setPoseInvalid(null)
      return
    }

    // Pose validation for the active exercise
    const poseCheck = poseValidatorRef.current.validate(lms, active)
    setPoseInvalid(!poseCheck.valid ? poseCheck.reason ?? null : null)

    if (!poseCheck.valid) {
      drawSkeleton(ctx, lms, w, h, '#6B7280')
      return
    }

    // Feed angle to the appropriate counter
    let newRepCount = repCountsRef.current[active]
    let repInProgress = false

    if (active === 'pullup') {
      const bodyMetrics = extractBodyRiseMetrics(lms)
      const cs = pullupCounterRef.current.update(elbow2D, bodyMetrics)
      newRepCount = cs.repCount
      repInProgress = cs.state !== 'IDLE' && cs.state !== 'HANGING'
      drawSkeleton(ctx, lms, w, h, EXERCISE_META.pullup.skeletonColor)
      // barY is still tracked internally for rep counting but not drawn
      setStateLabel(STATE_LABELS[cs.state])
      setStateColor(STATE_COLORS[cs.state])
      setFormCues(formCoachRef.current.getFormCues(lms, 'pullup', cs.state, cs.bodyRiseRejected))
    } else if (active === 'pushup') {
      const cs = pushupCounterRef.current.update(elbow)
      newRepCount = cs.repCount
      repInProgress = cs.state === 'DOWN'
      drawSkeleton(ctx, lms, w, h, EXERCISE_META.pushup.skeletonColor)
      setStateLabel(PUSHUP_STATE_LABELS[cs.state])
      setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
      setFormCues(formCoachRef.current.getFormCues(lms, 'pushup', cs.state))
    } else {
      const cs = squatCounterRef.current.update(knee)
      newRepCount = cs.repCount
      repInProgress = cs.state === 'DOWN'
      drawSkeleton(ctx, lms, w, h, EXERCISE_META.squat.skeletonColor)
      setStateLabel(SQUAT_STATE_LABELS[cs.state])
      setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
      setFormCues(formCoachRef.current.getFormCues(lms, 'squat', cs.state))
    }

    // Update rep-in-progress lock
    exerciseDetectorRef.current.setRepInProgress(repInProgress)

    // Track rep timestamps
    if (newRepCount > repCountsRef.current[active]) {
      const now = Date.now()
      if (!firstRepTimestampRef.current) firstRepTimestampRef.current = now
      lastRepTimestampRef.current = now
      triggerHaptic()
    }

    // Update counts
    repCountsRef.current[active] = newRepCount
    setRepCounts({ ...repCountsRef.current })
  }

  function triggerHaptic() {
    const total = repCountsRef.current.pushup + repCountsRef.current.pullup + repCountsRef.current.squat
    if (total > lastHapticRef.current) {
      lastHapticRef.current = total
      navigator.vibrate?.(30)
    }
  }

  // Suppress unused type warnings
  void (null as unknown as RepState | PushupState | SquatState)

  function handlePullupDifficulty(d: PullupDifficulty) {
    setPullupDifficulty(d)
    pullupCounterRef.current.setThresholds(PULLUP_PRESETS[d].thresholds)
  }

  function handleCameraFlip() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    exerciseDetectorRef.current.reset()
    elbowSmootherRef.current.reset()
    elbowSmoother2DRef.current.reset()
    kneeSmootherRef.current.reset()
    startCamera(next)
  }

  function handleConfirm() {
    if (totalReps <= 0) return
    const start = firstRepTimestampRef.current ?? Date.now()
    const end = lastRepTimestampRef.current ?? Date.now()
    const durationSeconds = Math.max(0, Math.round((end - start) / 1000))
    clearSession()
    const exercises = EXERCISE_TYPES
      .filter(t => repCountsRef.current[t] > 0)
      .map(t => ({ type: t, name: EXERCISE_META[t].name, reps: repCountsRef.current[t] }))
    onConfirm({ exercises, durationSeconds })
  }

  function handleCancel() {
    clearSession()
    onCancel()
  }

  // ── Active exercise display info ──────────────────────────────────────────

  const activeExerciseMeta = activeExercise ? EXERCISE_META[activeExercise] : null
  const activeRepCount = activeExercise ? repCounts[activeExercise] : 0
  const exercisesWithReps = EXERCISE_TYPES.filter(t => repCounts[t] > 0)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Camera feed — video is invisible; canvas handles all rendering */}
      <video
        ref={videoRef}
        className="absolute w-px h-px opacity-0 overflow-hidden"
        muted playsInline
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-safe pt-4 pb-3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <button
          onClick={handleCancel}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"
        >
          <X size={16} className="text-white/80" />
        </button>
        <p className="font-black text-white text-base flex-1 min-w-0 truncate">Antrenament automat</p>
        <button
          onClick={handleCameraFlip}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"
        >
          <FlipHorizontal2
            size={16}
            className={`text-white/80 transition-opacity ${cameraLoading ? 'animate-pulse' : ''}`}
          />
        </button>
      </div>

      {/* Active exercise indicator + rep count */}
      {!loading && !error && (
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
          {activeExerciseMeta ? (
            <>
              {/* Exercise indicator pill */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full mb-1"
                style={{ backgroundColor: `${activeExerciseMeta.color}25`, border: `1px solid ${activeExerciseMeta.color}50` }}>
                <span className="text-sm">{activeExerciseMeta.emoji}</span>
                <span className="text-xs font-bold" style={{ color: activeExerciseMeta.color }}>
                  {activeExerciseMeta.name}
                </span>
              </div>
              {/* Rep count */}
              <span
                className="text-7xl font-black text-white tabular-nums"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
              >
                {activeRepCount}
              </span>
              <span className="text-xs font-bold text-white/60 tracking-widest mt-0.5">REPETĂRI</span>
              {/* State label */}
              <div className="mt-2 px-3 py-1 rounded-full"
                style={{ backgroundColor: `${stateColor}33`, border: `1px solid ${stateColor}66` }}>
                <span className="text-xs font-bold" style={{ color: stateColor }}>{stateLabel}</span>
              </div>
              {/* Pull-up difficulty selector */}
              {activeExercise === 'pullup' && (
                <div className="mt-2 flex gap-1 pointer-events-auto">
                  {(Object.keys(PULLUP_PRESETS) as PullupDifficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => handlePullupDifficulty(d)}
                      className="px-3 py-1 rounded-full text-[10px] font-bold transition-all"
                      style={{
                        backgroundColor: pullupDifficulty === d ? '#1ED75F' : 'rgba(255,255,255,0.1)',
                        color: pullupDifficulty === d ? '#000' : 'rgba(255,255,255,0.6)',
                        border: `1px solid ${pullupDifficulty === d ? '#1ED75F' : 'rgba(255,255,255,0.2)'}`,
                      }}
                    >
                      {PULLUP_PRESETS[d].label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Detecting state — pulsing indicator */
            <div className="flex flex-col items-center mt-4">
              <div className="w-5 h-5 rounded-full bg-indigo-500 animate-pulse mb-3" />
              <span
                className="text-lg font-bold text-white/70"
                style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
              >
                Detectare exercițiu...
              </span>
              <span className="text-xs text-white/40 mt-1">
                Pune-te în poziția exercițiului
              </span>
            </div>
          )}
        </div>
      )}

      {/* Loading / error overlay */}
      {(loading || !!error) && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 z-10">
          {loading && !error && (
            <>
              <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              <p className="text-white/60 text-sm">Se inițializează camera...</p>
            </>
          )}
          {!!error && (
            <>
              <p className="text-red-400 text-sm font-semibold text-center px-8">{error}</p>
              <button
                onClick={handleCancel}
                className="mt-2 h-10 px-6 rounded-full border border-white/20 text-sm text-white/70"
              >
                Înapoi
              </button>
            </>
          )}
        </div>
      )}

      {/* Exercise detector state overlay */}
      {!loading && detectorState === 'LOADING' && (
        <div className="absolute bottom-36 left-4 right-4 z-10">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(99,102,241,0.88)', border: '1px solid rgba(99,102,241,0.6)' }}>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm font-bold">Se încarcă modelele...</span>
          </div>
        </div>
      )}

      {/* Pose invalid overlay */}
      {!loading && poseInvalid && detectorState !== 'LOADING' && (
        <div className="absolute bottom-36 left-4 right-4 z-10">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(99,102,241,0.88)', border: '1px solid rgba(99,102,241,0.6)' }}>
            <span className="text-white text-sm font-bold leading-tight">{poseInvalid}</span>
          </div>
        </div>
      )}

      {/* Form cue banners */}
      {!loading && !poseInvalid && formCues.length > 0 && (
        <div className="absolute bottom-36 left-4 right-4 flex flex-col gap-1.5 z-10">
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

      {/* Floating exercise summary panel — only when exercises have reps */}
      {exercisesWithReps.length > 0 && !loading && (
        <div className="absolute left-4 z-10 rounded-2xl px-3 py-2.5 min-w-[140px]"
          style={{
            bottom: '100px',
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {exercisesWithReps.map(t => {
            const meta = EXERCISE_META[t]
            const isActive = t === activeExercise
            return (
              <div
                key={t}
                className="flex items-center gap-2 py-1"
                style={{
                  borderLeft: isActive ? `3px solid ${meta.color}` : '3px solid transparent',
                  paddingLeft: '8px',
                }}
              >
                <span className="text-sm">{meta.emoji}</span>
                <span className={`text-xs font-semibold flex-1 ${isActive ? 'text-white' : 'text-white/60'}`}>
                  {meta.name}
                </span>
                <span className={`text-sm font-black tabular-nums ${isActive ? 'text-white' : 'text-white/60'}`}>
                  {repCounts[t]}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Action bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex gap-3 px-4 pb-8 pt-4"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 60%, transparent)' }}
      >
        <button
          onClick={handleCancel}
          className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          <X size={20} className="text-white/70" />
        </button>
        <button
          onClick={handleConfirm}
          disabled={totalReps === 0}
          className="flex-1 h-14 rounded-2xl bg-brand-green text-black font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
        >
          <Check size={20} />
          Termină{totalReps > 0 ? ` (${totalReps} repetări)` : ''}
        </button>
      </div>
    </div>
  )
}
