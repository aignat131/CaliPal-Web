'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Check, FlipHorizontal2 } from 'lucide-react'
import { HoldDetector, HOLD_EXERCISES, HOLD_STATE_LABELS, HOLD_STATE_COLORS } from '@/lib/ml/hold-detector'
import type { HoldExerciseType, HoldState } from '@/lib/ml/hold-detector'
import type { Landmark } from '@/lib/ml/pose-math'
import { drawSkeleton, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'
import type { HoldSession } from '@/types'

void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

export const HOLD_SESSION_KEY = 'calipal_hold_session'

// ── Types ────────────────────────────────────────────────────────────────────

export interface HoldResult {
  holdExercise: HoldExerciseType
  exerciseName: string
  totalHoldSeconds: number
  bestSegmentSeconds: number
  holdCount: number
}

interface Props {
  holdExercise: HoldExerciseType
  exerciseName: string
  onConfirm: (result: HoldResult) => void
  onCancel: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const tenths = Math.floor((ms % 1000) / 100)
  if (min > 0) return `${min}:${sec.toString().padStart(2, '0')}.${tenths}`
  return `${sec}.${tenths}`
}

// ── Skeleton color by state ──────────────────────────────────────────────────

const SKELETON_COLORS: Record<HoldState, string> = {
  WAITING:  '#6B7280',
  ENTERING: '#F59E0B',
  HOLDING:  '#1ED75F',
  BROKEN:   '#EF4444',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HoldTimerModal({ holdExercise, exerciseName, onConfirm, onCancel }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const animRef    = useRef<number | null>(null)
  const detectorRef = useRef<{
    detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }
    close?: () => void
  } | null>(null)

  const holdDetectorRef = useRef(new HoldDetector(holdExercise))

  // Camera
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user')
  const [cameraLoading, setCameraLoading] = useState(false)

  // UI state
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [holdState, setHoldState]       = useState<HoldState>('WAITING')
  const [totalHoldMs, setTotalHoldMs]   = useState(0)
  const [bestSegmentMs, setBestSegmentMs] = useState(0)
  const [holdCount, setHoldCount]       = useState(0)
  const [positionScore, setPositionScore] = useState(0)
  const [formCues, setFormCues]         = useState<string[]>([])

  const exerciseMeta = HOLD_EXERCISES[holdExercise]
  const hasHeld = totalHoldMs > 0

  // ── localStorage crash backup ─────────────────────────────────────────────

  const saveSession = useCallback(() => {
    if (totalHoldMs <= 0) return
    const session: HoldSession = {
      holdExercise,
      exerciseName,
      totalHoldMs,
      bestSegmentMs,
      holdCount,
      savedAt: Date.now(),
    }
    try { localStorage.setItem(HOLD_SESSION_KEY, JSON.stringify(session)) } catch { /* */ }
  }, [holdExercise, exerciseName, totalHoldMs, bestSegmentMs, holdCount])

  useEffect(() => {
    if (!hasHeld) return
    const id = setInterval(saveSession, 2000)
    return () => clearInterval(id)
  }, [hasHeld, saveSession])

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
    try { localStorage.removeItem(HOLD_SESSION_KEY) } catch { /* */ }
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
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
      })
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
    const snapshot = holdDetectorRef.current.update(lms)

    // Draw skeleton with state-appropriate color
    drawSkeleton(ctx, lms, w, h, SKELETON_COLORS[snapshot.state])

    // Haptic on state transitions
    if (snapshot.state === 'HOLDING' && holdState !== 'HOLDING') {
      navigator.vibrate?.(30)
    } else if (snapshot.state === 'BROKEN' && holdState !== 'BROKEN') {
      navigator.vibrate?.([20, 50, 20])
    }

    // Update UI state
    setHoldState(snapshot.state)
    setTotalHoldMs(snapshot.totalHoldMs)
    setBestSegmentMs(snapshot.bestSegmentMs)
    setHoldCount(snapshot.holdCount)
    setPositionScore(snapshot.positionScore)
    setFormCues(snapshot.cues)
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCameraFlip() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  function handleConfirm() {
    if (!hasHeld) return
    clearSession()
    onConfirm({
      holdExercise,
      exerciseName,
      totalHoldSeconds: Math.round(totalHoldMs / 1000),
      bestSegmentSeconds: Math.round(bestSegmentMs / 1000),
      holdCount,
    })
  }

  function handleCancel() {
    clearSession()
    onCancel()
  }

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
        <button
          onClick={handleCancel}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"
        >
          <X size={16} className="text-white/80" />
        </button>
        <p className="font-black text-white text-base flex-1 min-w-0 truncate">
          {exerciseMeta.emoji} {exerciseMeta.name}
        </p>
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

      {/* Timer + state display */}
      {!loading && !error && (
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
          {/* Exercise indicator pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full mb-1"
            style={{ backgroundColor: `${exerciseMeta.color}25`, border: `1px solid ${exerciseMeta.color}50` }}>
            <span className="text-sm">{exerciseMeta.emoji}</span>
            <span className="text-xs font-bold" style={{ color: exerciseMeta.color }}>
              {exerciseMeta.name}
            </span>
          </div>

          {/* Timer */}
          <span
            className="text-7xl font-black text-white tabular-nums"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
          >
            {formatTimer(totalHoldMs)}
          </span>
          <span className="text-xs font-bold text-white/60 tracking-widest mt-0.5">
            {holdCount > 1 ? `${holdCount} SEGMENTE` : 'DURATĂ'}
          </span>

          {/* State label */}
          <div className="mt-2 px-3 py-1 rounded-full"
            style={{
              backgroundColor: `${HOLD_STATE_COLORS[holdState]}33`,
              border: `1px solid ${HOLD_STATE_COLORS[holdState]}66`,
            }}>
            <span className="text-xs font-bold" style={{ color: HOLD_STATE_COLORS[holdState] }}>
              {HOLD_STATE_LABELS[holdState]}
            </span>
          </div>

          {/* Position quality bar */}
          {(holdState === 'HOLDING' || holdState === 'ENTERING') && (
            <div className="mt-2 w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${Math.round(positionScore * 100)}%`,
                  backgroundColor: positionScore > 0.7 ? '#1ED75F' : positionScore > 0.4 ? '#F59E0B' : '#EF4444',
                }}
              />
            </div>
          )}

          {/* Best segment */}
          {bestSegmentMs > 0 && holdState !== 'HOLDING' && (
            <span className="mt-2 text-xs text-white/40">
              Cel mai bun: {formatTimer(bestSegmentMs)}
            </span>
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

      {/* Form cue banners */}
      {!loading && formCues.length > 0 && (
        <div className="absolute bottom-36 left-4 right-4 flex flex-col gap-1.5 z-10">
          {formCues.map((cue, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                backgroundColor: 'rgba(245,158,11,0.88)',
                border: '1px solid #f59e0b80',
              }}
            >
              <span className="text-white text-xs font-bold leading-tight">{cue}</span>
            </div>
          ))}
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
          disabled={!hasHeld}
          className="flex-1 h-14 rounded-2xl bg-brand-green text-black font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
        >
          <Check size={20} />
          Termină{hasHeld ? ` (${formatTimer(totalHoldMs)})` : ''}
        </button>
      </div>
    </div>
  )
}
