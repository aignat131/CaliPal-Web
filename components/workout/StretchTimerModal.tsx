'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Check, FlipHorizontal2, ChevronRight } from 'lucide-react'
import {
  StretchDetector, STRETCH_EXERCISES, STRETCH_STATE_COLORS,
  getAngleArcInfo, depthColor,
} from '@/lib/ml/stretch-detector'
import type { StretchExerciseType, StretchState } from '@/lib/ml/stretch-detector'
import type { StretchRoutine } from '@/lib/data/stretch-routines'
import type { Landmark } from '@/lib/ml/pose-math'
import { drawSkeleton, drawAngleArc, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'
import DepthMeter from './DepthMeter'
import type { StretchSession } from '@/types'

void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

export const STRETCH_SESSION_KEY = 'calipal_stretch_session'

// ── Types ────────────────────────────────────────────────────────────────────

export interface StretchResult {
  exercises: { exercise: StretchExerciseType; name: string; holdSeconds: number; peakDepthScore: number; side?: 'left' | 'right' }[]
  totalSeconds: number
}

interface Props {
  stretchExercise: StretchExerciseType
  exerciseName: string
  routine?: StretchRoutine | null
  routineStepIndex?: number
  onConfirm: (result: StretchResult) => void
  onCancel: () => void
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const tenths = Math.floor((ms % 1000) / 100)
  if (min > 0) return `${min}:${sec.toString().padStart(2, '0')}.${tenths}`
  return `${sec}.${tenths}`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StretchTimerModal({
  stretchExercise: initialExercise,
  exerciseName: initialName,
  routine,
  onConfirm,
  onCancel,
}: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const animRef    = useRef<number | null>(null)
  const detectorRef = useRef<{
    detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }
    close?: () => void
  } | null>(null)

  // Routine state
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [currentSide, setCurrentSide] = useState<'left' | 'right' | null>(null)
  const [showSideTransition, setShowSideTransition] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<StretchResult['exercises']>([])

  // Current exercise
  const currentStep = routine?.steps[currentStepIdx]
  const currentExercise = currentStep?.exercise ?? initialExercise
  const currentMeta = STRETCH_EXERCISES[currentExercise]
  const isBilateral = currentStep?.bilateral ?? false
  const isLastStep = routine ? currentStepIdx >= routine.steps.length - 1 && (!isBilateral || currentSide === 'right') : true

  const stretchDetectorRef = useRef(new StretchDetector(currentExercise))

  // Camera
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user')
  const [cameraLoading, setCameraLoading] = useState(false)

  // UI state
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [stretchState, setStretchState]   = useState<StretchState>('WAITING')
  const [totalTimeMs, setTotalTimeMs]     = useState(0)
  const [depthScore, setDepthScore]       = useState(0)
  const [peakDepthScore, setPeakDepthScore] = useState(0)
  const [rawMeasurement, setRawMeasurement] = useState(0)
  const [measurementUnit, setMeasurementUnit] = useState('')
  const [targetMeasurement, setTargetMeasurement] = useState(0)
  const [formCues, setFormCues]           = useState<string[]>([])

  const hasStretched = totalTimeMs > 0 || completedSteps.length > 0

  // Reset detector when exercise changes
  useEffect(() => {
    stretchDetectorRef.current = new StretchDetector(currentExercise)
    setStretchState('WAITING')
    setTotalTimeMs(0)
    setDepthScore(0)
    setPeakDepthScore(0)
    setRawMeasurement(0)
    setFormCues([])
  }, [currentExercise, currentSide])

  // ── localStorage crash backup ─────────────────────────────────────────────

  const saveSession = useCallback(() => {
    if (!hasStretched) return
    const session: StretchSession = {
      stretchExercise: currentExercise,
      exerciseName: currentMeta.nameRO,
      totalTimeMs,
      peakDepthScore,
      peakRawMeasurement: rawMeasurement,
      savedAt: Date.now(),
    }
    try { localStorage.setItem(STRETCH_SESSION_KEY, JSON.stringify(session)) } catch { /* */ }
  }, [currentExercise, currentMeta.nameRO, totalTimeMs, peakDepthScore, rawMeasurement, hasStretched])

  useEffect(() => {
    if (!hasStretched) return
    const id = setInterval(saveSession, 2000)
    return () => clearInterval(id)
  }, [hasStretched, saveSession])

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
    try { localStorage.removeItem(STRETCH_SESSION_KEY) } catch { /* */ }
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

      setLoading(false)
      setCameraLoading(false)

      let lastTime = -1
      function detect(time: number) {
        if (!videoRef.current || !canvasRef.current) return
        const video  = videoRef.current
        const canvas = canvasRef.current
        const ctx    = canvas.getContext('2d')!
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          if (!detectorRef.current) return
          const result = detectorRef.current.detectForVideo(video, time)
          if (result.landmarks.length > 0) {
            processFrame(result.landmarks[0], ctx, canvas.width, canvas.height)
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
      try { await startCamera('user') }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Eroare cameră'); setLoading(false) }
    }
    init()
    return () => { cancelled = true; stopCamera() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Frame processing ──────────────────────────────────────────────────────

  function processFrame(lms: Landmark[], ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (showSideTransition) return

    const snapshot = stretchDetectorRef.current.update(lms)

    // Skeleton color by depth
    const skeletonColor = snapshot.state === 'IN_POSITION'
      ? depthColor(snapshot.depthScore)
      : '#6B7280'
    drawSkeleton(ctx, lms, w, h, skeletonColor)

    // Angle arc overlay
    const arcInfo = getAngleArcInfo(currentExercise)
    if (arcInfo && snapshot.rawMeasurement > 0) {
      drawAngleArc(ctx, lms, arcInfo.vertex, arcInfo.armA, arcInfo.armB, w, h, snapshot.rawMeasurement, depthColor(snapshot.depthScore))
    }

    // Haptic on entering position
    if (snapshot.state === 'IN_POSITION' && stretchState !== 'IN_POSITION') {
      navigator.vibrate?.(30)
    }

    setStretchState(snapshot.state)
    setTotalTimeMs(snapshot.totalTimeMs)
    setDepthScore(snapshot.depthScore)
    setPeakDepthScore(snapshot.peakDepthScore)
    setRawMeasurement(snapshot.rawMeasurement)
    setMeasurementUnit(snapshot.measurementUnit)
    setTargetMeasurement(snapshot.targetMeasurement)
    setFormCues(snapshot.cues)
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCameraFlip() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  function completeCurrentStep() {
    const stepResult = {
      exercise: currentExercise,
      name: currentMeta.nameRO,
      holdSeconds: Math.round(totalTimeMs / 1000),
      peakDepthScore,
      ...(currentSide && { side: currentSide as 'left' | 'right' }),
    }
    return [...completedSteps, stepResult]
  }

  function handleNext() {
    const steps = completeCurrentStep()
    setCompletedSteps(steps)

    if (!routine) {
      // Single exercise — finish
      clearSession()
      const totalSec = steps.reduce((s, e) => s + e.holdSeconds, 0)
      onConfirm({ exercises: steps, totalSeconds: totalSec })
      return
    }

    const step = routine.steps[currentStepIdx]

    // Handle bilateral: if first side done, show transition
    if (step.bilateral && currentSide !== 'right') {
      setShowSideTransition(true)
      setTimeout(() => {
        setCurrentSide('right')
        setShowSideTransition(false)
      }, 3000)
      return
    }

    // Move to next step
    if (currentStepIdx < routine.steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1)
      setCurrentSide(routine.steps[currentStepIdx + 1].bilateral ? 'left' : null)
    } else {
      // Last step — finish routine
      clearSession()
      const totalSec = steps.reduce((s, e) => s + e.holdSeconds, 0)
      onConfirm({ exercises: steps, totalSeconds: totalSec })
    }
  }

  function handleConfirm() {
    if (!hasStretched) return
    const steps = completeCurrentStep()
    clearSession()
    const totalSec = steps.reduce((s, e) => s + e.holdSeconds, 0)
    onConfirm({ exercises: steps, totalSeconds: totalSec })
  }

  function handleCancel() {
    clearSession()
    onCancel()
  }

  // ── Routine progress ──────────────────────────────────────────────────────

  const totalRoutineSteps = routine
    ? routine.steps.reduce((n, s) => n + (s.bilateral ? 2 : 1), 0)
    : 1
  const currentRoutineStep = routine
    ? completedSteps.length + 1
    : 1

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
        muted playsInline
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined}
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-safe pt-4 pb-3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <button onClick={handleCancel}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
          <X size={16} className="text-white/80" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-base truncate">
            {currentMeta.emoji} {currentMeta.nameRO}
          </p>
          {routine && (
            <p className="text-[10px] text-white/40 font-bold">
              {currentRoutineStep} / {totalRoutineSteps}
              {currentSide && ` · ${currentSide === 'left' ? 'Stânga' : 'Dreapta'}`}
            </p>
          )}
        </div>
        <button onClick={handleCameraFlip}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
          <FlipHorizontal2 size={16} className={`text-white/80 transition-opacity ${cameraLoading ? 'animate-pulse' : ''}`} />
        </button>
      </div>

      {/* Depth meter + timer (hero section) */}
      {!loading && !error && !showSideTransition && (
        <div className="absolute top-14 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
          {/* Exercise pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full mb-1"
            style={{ backgroundColor: `${currentMeta.color}25`, border: `1px solid ${currentMeta.color}50` }}>
            <span className="text-sm">{currentMeta.emoji}</span>
            <span className="text-xs font-bold" style={{ color: currentMeta.color }}>{currentMeta.nameRO}</span>
          </div>

          {/* Depth meter */}
          <DepthMeter
            depthScore={depthScore}
            peakDepthScore={peakDepthScore}
            rawMeasurement={rawMeasurement}
            measurementUnit={measurementUnit}
            targetMeasurement={targetMeasurement}
          />

          {/* Timer (secondary) */}
          <span
            className="text-2xl font-black text-white tabular-nums -mt-2"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
          >
            {formatTimer(totalTimeMs)}
          </span>

          {/* State pill */}
          <div className="mt-1.5 px-3 py-1 rounded-full"
            style={{
              backgroundColor: `${STRETCH_STATE_COLORS[stretchState]}33`,
              border: `1px solid ${STRETCH_STATE_COLORS[stretchState]}66`,
            }}>
            <span className="text-[10px] font-bold" style={{ color: STRETCH_STATE_COLORS[stretchState] }}>
              {stretchState === 'WAITING' ? 'Intră în poziție...' : 'Menține! ✓'}
            </span>
          </div>

          {/* Peak depth */}
          {peakDepthScore > 0.05 && stretchState === 'IN_POSITION' && (
            <span className="mt-1 text-[10px] text-white/40 font-bold">
              Record: {Math.round(peakDepthScore * 100)}%
            </span>
          )}
        </div>
      )}

      {/* Side transition overlay */}
      {showSideTransition && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-20">
          <span className="text-4xl">🔄</span>
          <p className="text-white font-black text-xl">Schimbă partea</p>
          <p className="text-white/50 text-sm">Continuă cu partea dreaptă</p>
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mt-2" />
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
              <button onClick={handleCancel}
                className="mt-2 h-10 px-6 rounded-full border border-white/20 text-sm text-white/70">
                Înapoi
              </button>
            </>
          )}
        </div>
      )}

      {/* Form cue banners */}
      {!loading && !showSideTransition && formCues.length > 0 && (
        <div className="absolute bottom-36 left-4 right-4 flex flex-col gap-1.5 z-10">
          {formCues.map((cue, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ backgroundColor: 'rgba(245,158,11,0.88)', border: '1px solid #f59e0b80' }}>
              <span className="text-white text-xs font-bold leading-tight">{cue}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex gap-3 px-4 pb-8 pt-4"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 60%, transparent)' }}>
        <button onClick={handleCancel}
          className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
          <X size={20} className="text-white/70" />
        </button>

        {routine && !isLastStep ? (
          /* Next button for routine */
          <button
            onClick={handleNext}
            disabled={totalTimeMs < 1000}
            className="flex-1 h-14 rounded-2xl text-black font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: currentMeta.color }}
          >
            <span>Următorul</span>
            <ChevronRight size={18} />
          </button>
        ) : (
          /* Finish button */
          <button
            onClick={routine ? handleNext : handleConfirm}
            disabled={!hasStretched}
            className="flex-1 h-14 rounded-2xl bg-brand-green text-black font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
          >
            <Check size={20} />
            {routine ? 'Termină rutina' : `Termină (${formatTimer(totalTimeMs)})`}
          </button>
        )}
      </div>
    </div>
  )
}
