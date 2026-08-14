'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { FlipHorizontal2, VideoOff } from 'lucide-react'
import {
  RepCounter, STATE_COLORS,
  PushupCounter, SquatCounter,
  BALANCED_PULLUP, EASY_PUSHUP, BALANCED_SQUAT,
} from '@/lib/ml/rep-counter'
import { bestElbowAngle2D, pushupDepthAngle, squatDepthAngle, MP, AngleSmoother, extractBodyRiseMetrics } from '@/lib/ml/pose-math'
import type { Landmark } from '@/lib/ml/pose-math'
import { PoseValidator } from '@/lib/ml/pose-validator'
import { PositionGate } from '@/lib/ml/position-gate'
import { drawSkeleton, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'
import type { ExerciseType } from '@/lib/ml/form-coach'
import { useBattleAudio } from '@/lib/battle/useBattleAudio'

void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

interface Props {
  exerciseType: ExerciseType
  onRepCounted: (newCount: number) => void
  onCameraReady?: () => void
  /** Overlay content (bars, timer) rendered on top of the camera */
  children?: React.ReactNode
}

/**
 * Full-screen camera-based ML rep counter for battle mode.
 * Same detection logic as RepCounterModal.
 */
export default function BattleCameraView({ exerciseType, onRepCounted, onCameraReady, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number | null>(null)
  const detectorRef = useRef<{ detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }; close?: () => void } | null>(null)

  const repCounterRef = useRef(new RepCounter(BALANCED_PULLUP))
  const pushupCounterRef = useRef(new PushupCounter(EASY_PUSHUP))
  const squatCounterRef = useRef(new SquatCounter(BALANCED_SQUAT))
  const poseValidatorRef = useRef(new PoseValidator())
  const positionGateRef = useRef(new PositionGate(exerciseType))
  const elbowSmootherRef       = useRef(new AngleSmoother(0.3))
  const pushupDepthSmootherRef = useRef(new AngleSmoother(0.3))
  const kneeSmootherRef        = useRef(new AngleSmoother(0.3))

  const repCountRef = useRef(0)
  const lastHapticRef = useRef(0)
  const cameraReadyFiredRef = useRef(false)
  const { playRepBeep, vibrate } = useBattleAudio()

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [repCount, setRepCount] = useState(0)

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
    pushupDepthSmootherRef.current.reset()
    kneeSmootherRef.current.reset()
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
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
      positionGateRef.current.initialize()

      // Signal camera is ready
      if (!cameraReadyFiredRef.current && onCameraReady) {
        cameraReadyFiredRef.current = true
        onCameraReady()
      }

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
          if (!detectorRef.current) return
          const result = detectorRef.current.detectForVideo(video, time)
          if (result.landmarks.length > 0) {
            processFrame(result.landmarks[0], ctx, canvas.width, canvas.height)
          } else {
            positionGateRef.current.tick()
          }
        }
        animRef.current = requestAnimationFrame(detect)
      }
      animRef.current = requestAnimationFrame(detect)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Camera error')
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function processFrame(lms: Landmark[], ctx: CanvasRenderingContext2D, w: number, h: number) {
    const poseCheck = poseValidatorRef.current.validate(lms, exerciseType)
    let newRepCount = repCountRef.current
    const gate = positionGateRef.current

    if (exerciseType === 'pullup') {
      const rawElbow = bestElbowAngle2D(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
      const elbow = elbowSmootherRef.current.smooth(rawElbow)
      gate.update(lms, elbow)
      if (poseCheck.valid && gate.isOpen) {
        const bodyMetrics = extractBodyRiseMetrics(lms)
        const cs = repCounterRef.current.update(elbow, bodyMetrics)
        newRepCount = cs.repCount
        drawSkeleton(ctx, lms, w, h, STATE_COLORS[cs.state] ?? '#1ED75F')
      } else {
        drawSkeleton(ctx, lms, w, h, '#6B7280')
      }
    } else if (exerciseType === 'pushup') {
      const rawDepth = pushupDepthAngle(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
      const depth = pushupDepthSmootherRef.current.smooth(rawDepth)
      gate.update(lms, depth)
      if (poseCheck.valid && gate.isOpen) {
        const cs = pushupCounterRef.current.update(depth)
        newRepCount = cs.repCount
        drawSkeleton(ctx, lms, w, h, STATE_COLORS[cs.state as keyof typeof STATE_COLORS] ?? '#1ED75F')
      } else {
        drawSkeleton(ctx, lms, w, h, '#6B7280')
      }
    } else if (exerciseType === 'squat') {
      const rawKnee = squatDepthAngle(lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE], lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE], lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
      const knee = kneeSmootherRef.current.smooth(rawKnee)
      gate.update(lms, knee)
      if (poseCheck.valid && gate.isOpen) {
        const cs = squatCounterRef.current.update(knee)
        newRepCount = cs.repCount
        drawSkeleton(ctx, lms, w, h, STATE_COLORS[cs.state as keyof typeof STATE_COLORS] ?? '#1ED75F')
      } else {
        drawSkeleton(ctx, lms, w, h, '#6B7280')
      }
    }

    if (newRepCount > repCountRef.current) {
      repCountRef.current = newRepCount
      setRepCount(newRepCount)
      onRepCounted(newRepCount)

      const now = Date.now()
      if (now - lastHapticRef.current > 300) {
        playRepBeep()
        vibrate(15)
        lastHapticRef.current = now
      }
    }
  }

  useEffect(() => {
    startCamera('user')
    return () => stopCamera()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFlip() {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    startCamera(next)
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-3 bg-black">
        <VideoOff size={32} className="text-red-400/60" />
        <p className="text-sm text-white/50">{error}</p>
      </div>
    )
  }

  const mirrorStyle = facingMode === 'user' ? { transform: 'scaleX(-1)' } : undefined

  return (
    <div className="fixed inset-0 z-[55] bg-black">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-[var(--accent)] rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Se inițializează camera...</p>
        </div>
      )}

      {/* Video (hidden, used as source) */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Canvas — full-screen camera feed with skeleton */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={mirrorStyle}
      />

      {/* Overlay content (bars, timer, etc.) */}
      {children}

      {/* Flip camera button */}
      <button
        onClick={handleFlip}
        className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-black/40 border border-white/20 flex items-center justify-center backdrop-blur-sm"
      >
        <FlipHorizontal2 size={16} className="text-white/80" />
      </button>

      {/* Rep count — large centered */}
      {!loading && (
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
          <span
            className="text-7xl font-black text-white tabular-nums"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
          >
            {repCount}
          </span>
        </div>
      )}
    </div>
  )
}
