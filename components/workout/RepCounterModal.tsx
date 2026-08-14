'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Check, Camera, FlipHorizontal2 } from 'lucide-react'
import {
  RepCounter, STATE_LABELS, STATE_COLORS,
  PushupCounter, PUSHUP_STATE_LABELS,
  SquatCounter, SQUAT_STATE_LABELS,
  PistolSquatCounter,
  BALANCED_PULLUP,
  BALANCED_PUSHUP, BALANCED_SQUAT, EASY_PUSHUP,
} from '@/lib/ml/rep-counter'
import type { RepState, PushupState, SquatState } from '@/lib/ml/rep-counter'
import { bestElbowAngle2D, pushupDepthAngle, squatDepthAngle, perLegSquatData, MP, AngleSmoother, extractBodyRiseMetrics } from '@/lib/ml/pose-math'
import type { Landmark } from '@/lib/ml/pose-math'
import { FormCoach } from '@/lib/ml/form-coach'
import type { ExerciseType, FormCue } from '@/lib/ml/form-coach'
import { drawSkeleton, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'
import { renderVideoCover } from '@/lib/ml/video-render'
import { PoseValidator } from '@/lib/ml/pose-validator'
import { PositionGate } from '@/lib/ml/position-gate'
import type { GateState } from '@/lib/ml/position-gate'
import type { RepSession } from '@/types'

// keep linter happy — POSE_CONNECTIONS imported to ensure tree-shaking keeps it
void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

export const REP_SESSION_KEY = 'calipal_rep_session'

interface Props {
  exerciseType: ExerciseType
  exerciseName: string
  onConfirm: (reps: number, durationSeconds: number) => void
  onCancel: () => void
}

export default function RepCounterModal({ exerciseType, exerciseName, onConfirm, onCancel }: Props) {
  const isPistol = exerciseName.toLowerCase().includes('pistol')

  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const animRef    = useRef<number | null>(null)
  const detectorRef = useRef<{ detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }; close?: () => void } | null>(null)
  const lastHapticRef = useRef(0)

  const repCounterRef    = useRef(new RepCounter(BALANCED_PULLUP))
  const pushupCounterRef = useRef(new PushupCounter(EASY_PUSHUP))
  const squatCounterRef  = useRef(new SquatCounter(BALANCED_SQUAT))
  const pistolCounterRef = useRef(new PistolSquatCounter(BALANCED_SQUAT))
  const formCoachRef     = useRef(new FormCoach())
  const poseValidatorRef = useRef(new PoseValidator())
  const positionGateRef  = useRef(new PositionGate(exerciseType))

  // Angle smoothers — one per joint type
  const elbowSmoother2DRef       = useRef(new AngleSmoother(0.3)) // 2D angles for pull-ups (Z-depth unreliable)
  const pushupDepthSmootherRef   = useRef(new AngleSmoother(0.3)) // blended push-up depth angle
  const kneeSmootherRef          = useRef(new AngleSmoother(0.3))
  // Pistol mode: separate smoothers per leg (independent signals)
  const leftKneeSmootherRef  = useRef(new AngleSmoother(0.3))
  const rightKneeSmootherRef = useRef(new AngleSmoother(0.3))

  // Rep timing — track first and last rep timestamps
  const firstRepTimestampRef = useRef<number | null>(null)
  const lastRepTimestampRef = useRef<number | null>(null)

  const [poseInvalid, setPoseInvalid] = useState<string | null>(null)
  const [gateStatus, setGateStatus] = useState<GateState>('LOADING')

  // Camera facing mode
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user')
  const facingModeRef = useRef<'environment' | 'user'>('user')
  const [cameraLoading, setCameraLoading] = useState(false)

  const [repCount, setRepCount]         = useState(0)
  const [stateLabel, setStateLabel]     = useState('Pregătire...')
  const [stateColor, setStateColor]     = useState('#6B7280')
  const [formCues, setFormCues]         = useState<FormCue[]>([])
  const [strictMode, setStrictMode]     = useState(false)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  // Pistol squat per-leg state
  const [pistolLeg, setPistolLeg] = useState<'left' | 'right' | null>(null)
  const [pistolLeft, setPistolLeft] = useState(0)
  const [pistolRight, setPistolRight] = useState(0)

  // Use refs so the rAF loop always reads latest values without closure staleness
  const repCountRef = useRef(0)

  // ── localStorage crash backup ─────────────────────────────────────────────
  const saveSession = useCallback(() => {
    if (repCountRef.current <= 0) return
    const session: RepSession = {
      exerciseType,
      exerciseName,
      repCount: repCountRef.current,
      firstRepTimestamp: firstRepTimestampRef.current,
      lastRepTimestamp: lastRepTimestampRef.current,
      savedAt: Date.now(),
    }
    try { localStorage.setItem(REP_SESSION_KEY, JSON.stringify(session)) } catch { /* */ }
  }, [exerciseType, exerciseName])

  // Persist every 2s when reps > 0
  useEffect(() => {
    if (repCount === 0) return
    const id = setInterval(saveSession, 2000)
    return () => clearInterval(id)
  }, [repCount > 0, saveSession]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save on page unload/hide — beforeunload is unreliable on mobile,
  // so we also listen to pagehide (iOS Safari) and visibilitychange (Android Chrome)
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
    try { localStorage.removeItem(REP_SESSION_KEY) } catch { /* */ }
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
    // Reset smoothers on camera switch — different perspective can yield different angle offsets
    elbowSmoother2DRef.current.reset()
    pushupDepthSmootherRef.current.reset()
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

      // Only initialize MediaPipe once — reuse cached detector on camera flips
      if (!detectorRef.current) {
        const { createPoseLandmarker } = await import('@/lib/ml/create-pose-landmarker')
        detectorRef.current = await createPoseLandmarker(POSE_MODEL_URL)
      }

      setLoading(false)
      setCameraLoading(false)

      // Initialize NN position gate (loads model per exercise type, non-blocking)
      positionGateRef.current.initialize().then(() => {
        setGateStatus(positionGateRef.current.gateState)
      })

      let lastTime = -1
      function detect(time: number) {
        if (!videoRef.current || !canvasRef.current) return
        const video  = videoRef.current
        const canvas = canvasRef.current
        const ctx    = canvas.getContext('2d')!

        // Manual cover rendering — sets canvas buffer to display size and applies
        // a transform that maps video coordinates to display coordinates
        const dims = renderVideoCover(ctx, canvas, video)
        if (!dims) { animRef.current = requestAnimationFrame(detect); return }

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          if (!detectorRef.current) { animRef.current = requestAnimationFrame(detect); return }
          const result = detectorRef.current.detectForVideo(video, time)
          if (result.landmarks.length > 0) {
            processFrame(result.landmarks[0], ctx, dims.vw, dims.vh)
          } else {
            // No body detected — check if gate should go stale (phone picked up, user left frame)
            positionGateRef.current.tick()
            setGateStatus(positionGateRef.current.gateState)
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
    return () => {
      cancelled = true
      stopCamera()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — exerciseType is stable for modal's lifetime

  function processFrame(lms: Landmark[], ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Pose validation — gates the rep counters (no reps count when invalid)
    const poseCheck = poseValidatorRef.current.validate(lms, exerciseType)
    setPoseInvalid(!poseCheck.valid ? poseCheck.reason ?? null : null)

    // Always compute angles for visual feedback, but only feed them to the
    // rep counter state machine when the pose is valid. When invalid the
    // skeleton turns gray and the counter freezes.
    let newRepCount = repCountRef.current

    // NN gate: update every frame (triggers async inference internally when needed)
    const gate = positionGateRef.current

    if (exerciseType === 'pullup') {
      // Use 2D elbow angle for pull-ups — Z-depth is unreliable from front-facing cameras
      const rawElbow2D = bestElbowAngle2D(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
      const elbow2D = elbowSmoother2DRef.current.smooth(rawElbow2D)
      gate.update(lms, elbow2D)
      setGateStatus(gate.gateState)

      if (poseCheck.valid && gate.isOpen) {
        const bodyMetrics = extractBodyRiseMetrics(lms)
        const cs = repCounterRef.current.update(elbow2D, bodyMetrics)
        newRepCount = cs.repCount
        drawSkeleton(ctx, lms, w, h, STATE_COLORS[cs.state] ?? '#1ED75F')
        // barY is still tracked internally for rep counting but not drawn
        setStateLabel(STATE_LABELS[cs.state])
        setStateColor(STATE_COLORS[cs.state])
        setFormCues(formCoachRef.current.getFormCues(lms, 'pullup', cs.state, cs.bodyRiseRejected))
      } else if (!poseCheck.valid) {
        drawSkeleton(ctx, lms, w, h, '#6B7280')
      } else {
        drawSkeleton(ctx, lms, w, h, '#6366F1')
      }

    } else if (exerciseType === 'pushup') {
      const rawDepth = pushupDepthAngle(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
      const depth = pushupDepthSmootherRef.current.smooth(rawDepth)
      gate.update(lms, depth)
      setGateStatus(gate.gateState)

      if (poseCheck.valid && gate.isOpen) {
        const cs = pushupCounterRef.current.update(depth)
        newRepCount = cs.repCount
        drawSkeleton(ctx, lms, w, h, '#F97316')
        setStateLabel(PUSHUP_STATE_LABELS[cs.state])
        setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
        setFormCues(formCoachRef.current.getFormCues(lms, 'pushup', cs.state))
      } else if (!poseCheck.valid) {
        drawSkeleton(ctx, lms, w, h, '#6B7280')
      } else {
        drawSkeleton(ctx, lms, w, h, '#6366F1')
      }

    } else {
      // Position gate still uses the blended squat angle
      const rawKnee = squatDepthAngle(lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE], lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE], lms[MP.LEFT_SHOULDER], lms[MP.RIGHT_SHOULDER])
      const knee = kneeSmootherRef.current.smooth(rawKnee)
      gate.update(lms, knee)
      setGateStatus(gate.gateState)

      if (poseCheck.valid && gate.isOpen) {
        if (isPistol) {
          // Pistol squat: per-leg angles + ankle Y for leg detection
          const leg = perLegSquatData(lms)
          const lk = leftKneeSmootherRef.current.smooth(leg.leftKneeAngle)
          const rk = rightKneeSmootherRef.current.smooth(leg.rightKneeAngle)
          const cs = pistolCounterRef.current.update(lk, rk, leg.leftAnkleY, leg.rightAnkleY)
          newRepCount = cs.repCount
          setPistolLeg(cs.activeLeg)
          setPistolLeft(cs.leftReps)
          setPistolRight(cs.rightReps)
          drawSkeleton(ctx, lms, w, h, '#3B82F6')
          setStateLabel(SQUAT_STATE_LABELS[cs.state])
          setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
          setFormCues(formCoachRef.current.getFormCues(lms, 'squat', cs.state))
        } else {
          const cs = squatCounterRef.current.update(knee)
          newRepCount = cs.repCount
          drawSkeleton(ctx, lms, w, h, '#3B82F6')
          setStateLabel(SQUAT_STATE_LABELS[cs.state])
          setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
          setFormCues(formCoachRef.current.getFormCues(lms, 'squat', cs.state))
        }
      } else if (!poseCheck.valid) {
        drawSkeleton(ctx, lms, w, h, '#6B7280')
      } else {
        drawSkeleton(ctx, lms, w, h, '#6366F1')
      }
    }

    // Track rep timestamps
    if (newRepCount > repCountRef.current) {
      const now = Date.now()
      if (!firstRepTimestampRef.current) firstRepTimestampRef.current = now
      lastRepTimestampRef.current = now
    }

    triggerHaptic(newRepCount)
    setRepCount(newRepCount)
    repCountRef.current = newRepCount
  }

  function triggerHaptic(count: number) {
    if (count > lastHapticRef.current) {
      lastHapticRef.current = count
      navigator.vibrate?.(30)
    }
  }

  function handleCameraFlip() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    facingModeRef.current = next
    setFacingMode(next)
    positionGateRef.current.reset() // baseline invalid after camera change
    startCamera(next)
  }

  function handleConfirm() {
    if (repCountRef.current <= 0) return
    const start = firstRepTimestampRef.current ?? Date.now()
    const end = lastRepTimestampRef.current ?? Date.now()
    const durationSeconds = Math.max(0, Math.round((end - start) / 1000))
    clearSession()
    onConfirm(repCountRef.current, durationSeconds)
  }

  function handleCancel() {
    clearSession()
    onCancel()
  }

  // Suppress "declared but never used" for state types
  void (null as unknown as RepState | PushupState | SquatState)

  function handleModeToggle() {
    const nextStrict = !strictMode
    setStrictMode(nextStrict)
    poseValidatorRef.current.setStrict(nextStrict)
    pushupCounterRef.current.setThresholds(nextStrict ? BALANCED_PUSHUP : EASY_PUSHUP)
    poseValidatorRef.current.reset()
  }

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

      {/* Header: exercise name + camera flip + close */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-safe pt-4 pb-3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <button
          onClick={handleCancel}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"
        >
          <X size={16} className="text-white/80" />
        </button>
        <p className="font-black text-white text-base flex-1 min-w-0 truncate">{exerciseName}</p>
        {/* Easy/Strict toggle — pushups only */}
        {exerciseType === 'pushup' && (
          <button
            onClick={handleModeToggle}
            className="h-7 px-3 rounded-full text-xs font-bold flex-shrink-0 transition-colors"
            style={{
              backgroundColor: strictMode ? 'rgba(239,68,68,0.25)' : 'rgba(30,215,95,0.25)',
              border: `1px solid ${strictMode ? 'rgba(239,68,68,0.5)' : 'rgba(30,215,95,0.5)'}`,
              color: strictMode ? '#ef4444' : '#1ED75F',
            }}
          >
            {strictMode ? 'Strict' : 'Easy'}
          </button>
        )}
        {/* Camera flip button */}
        <button
          onClick={handleCameraFlip}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"
          title={facingMode === 'environment' ? 'Cameră față' : 'Cameră spate'}
        >
          <FlipHorizontal2
            size={16}
            className={`text-white/80 transition-opacity ${cameraLoading ? 'animate-pulse' : ''}`}
          />
        </button>
      </div>

      {/* Rep count (top center) */}
      {!loading && !error && (
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
          <span
            className="text-7xl font-black text-white tabular-nums"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
          >
            {repCount}
          </span>
          <span className="text-xs font-bold text-white/60 tracking-widest mt-0.5">REPETĂRI</span>
          {/* Pistol squat per-leg breakdown */}
          {isPistol && (
            <div className="flex items-center gap-3 mt-1.5">
              <span className={`text-sm font-bold tabular-nums ${pistolLeg === 'left' ? 'text-blue-400' : 'text-white/50'}`}
                style={{ textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
                S: {pistolLeft}
              </span>
              <span className="text-white/30 text-xs">|</span>
              <span className={`text-sm font-bold tabular-nums ${pistolLeg === 'right' ? 'text-blue-400' : 'text-white/50'}`}
                style={{ textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
                D: {pistolRight}
              </span>
            </div>
          )}
          <div className="mt-2 px-3 py-1 rounded-full"
            style={{ backgroundColor: `${stateColor}33`, border: `1px solid ${stateColor}66` }}>
            <span className="text-xs font-bold" style={{ color: stateColor }}>{stateLabel}</span>
          </div>
          {/* Pull-up difficulty selector */}
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
              <Camera size={32} className="text-red-400" />
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

      {/* NN gate overlay — takes priority when gate is not confirmed */}
      {!loading && (gateStatus === 'LOADING' || gateStatus === 'VERIFYING') && (
        <div className="absolute bottom-28 left-4 right-4 flex flex-col gap-1.5 z-10">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(99,102,241,0.88)', border: '1px solid rgba(99,102,241,0.6)' }}
          >
            <span className="text-white text-sm font-bold leading-tight">
              {gateStatus === 'LOADING' ? 'Se incarcă modelul...' : (
                { pushup: 'Pune-te în poziție', pullup: 'Agață-te de bară', squat: 'Stai în picioare' }[exerciseType]
              )}
            </span>
          </div>
        </div>
      )}

      {/* Pose invalid overlay (hidden when gate overlay is showing) */}
      {!loading && poseInvalid && !(gateStatus === 'LOADING' || gateStatus === 'VERIFYING') && (
        <div className="absolute bottom-28 left-4 right-4 flex flex-col gap-1.5 z-10">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(99,102,241,0.88)', border: '1px solid rgba(99,102,241,0.6)' }}
          >
            <span className="text-white text-sm font-bold leading-tight">{poseInvalid}</span>
          </div>
        </div>
      )}

      {/* Form cue banners */}
      {!loading && !poseInvalid && formCues.length > 0 && (
        <div className="absolute bottom-28 left-4 right-4 flex flex-col gap-1.5 z-10">
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
          disabled={repCount === 0}
          className="flex-1 h-14 rounded-2xl bg-brand-green text-black font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
        >
          <Check size={20} />
          Confirmă {repCount} repetăr{repCount === 1 ? 'e' : 'i'}
        </button>
      </div>
    </div>
  )
}
