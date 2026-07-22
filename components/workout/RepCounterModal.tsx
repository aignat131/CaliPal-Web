'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Check, Camera, FlipHorizontal2 } from 'lucide-react'
import {
  RepCounter, STATE_LABELS, STATE_COLORS,
  PushupCounter, PUSHUP_STATE_LABELS,
  SquatCounter, SQUAT_STATE_LABELS,
  STRICT_PULLUP, BALANCED_PULLUP, EASY_PULLUP,
  STRICT_PUSHUP, BALANCED_PUSHUP, EASY_PUSHUP,
  STRICT_SQUAT, BALANCED_SQUAT, EASY_SQUAT,
} from '@/lib/ml/rep-counter'
import type { RepState, PushupState, SquatState } from '@/lib/ml/rep-counter'
import { avgElbowAngle, avgKneeAngle, bestElbowAngle, bestKneeAngle, MP, AngleSmoother } from '@/lib/ml/pose-math'
import type { Landmark } from '@/lib/ml/pose-math'
import { FormCoach } from '@/lib/ml/form-coach'
import type { ExerciseType, FormCue } from '@/lib/ml/form-coach'
import { drawSkeleton, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'
import { PoseValidator } from '@/lib/ml/pose-validator'

// keep linter happy — POSE_CONNECTIONS imported to ensure tree-shaking keeps it
void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

interface Props {
  exerciseType: ExerciseType
  exerciseName: string
  onConfirm: (reps: number) => void
  onCancel: () => void
  initialMode?: 'strict' | 'balanced' | 'easy'
}

export default function RepCounterModal({ exerciseType, exerciseName, onConfirm, onCancel, initialMode }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const animRef    = useRef<number | null>(null)
  const detectorRef = useRef<{ detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }; close?: () => void } | null>(null)
  const lastHapticRef = useRef(0)

  const repCounterRef    = useRef(new RepCounter())
  const pushupCounterRef = useRef(new PushupCounter())
  const squatCounterRef  = useRef(new SquatCounter())
  const formCoachRef     = useRef(new FormCoach())
  const poseValidatorRef = useRef(new PoseValidator())

  // Angle smoothers — one per joint type
  const elbowSmootherRef = useRef(new AngleSmoother(0.3))
  const kneeSmootherRef  = useRef(new AngleSmoother(0.3))

  const [mode, setMode] = useState<'strict' | 'balanced' | 'easy'>(initialMode ?? 'strict')
  const [modeToast, setModeToast] = useState(false)
  const [poseInvalid, setPoseInvalid] = useState<string | null>(null)

  // Camera facing mode
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('user')
  const facingModeRef = useRef<'environment' | 'user'>('user')
  const [cameraLoading, setCameraLoading] = useState(false)

  const [repCount, setRepCount]         = useState(0)
  const [primaryAngle, setPrimaryAngle] = useState(0)
  const [stateLabel, setStateLabel]     = useState('Pregătire...')
  const [stateColor, setStateColor]     = useState('#6B7280')
  const [formCues, setFormCues]         = useState<FormCue[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  // Arc progress 0–1: how deep into the rep movement the user is
  const [arcProgress, setArcProgress] = useState(0)
  // Velocity: degrees/frame of the smoothed angle
  const [angleVelocity, setAngleVelocity] = useState(0)

  // Use refs so the rAF loop always reads latest values without closure staleness
  const repCountRef = useRef(0)
  const modeRef = useRef<'strict' | 'balanced' | 'easy'>(initialMode ?? 'strict')

  // Threshold lookup helpers
  function pullupThreshold(m: 'strict' | 'balanced' | 'easy') {
    return m === 'easy' ? EASY_PULLUP : m === 'balanced' ? BALANCED_PULLUP : STRICT_PULLUP
  }
  function pushupThreshold(m: 'strict' | 'balanced' | 'easy') {
    return m === 'easy' ? EASY_PUSHUP : m === 'balanced' ? BALANCED_PUSHUP : STRICT_PUSHUP
  }
  function squatThreshold(m: 'strict' | 'balanced' | 'easy') {
    return m === 'easy' ? EASY_SQUAT : m === 'balanced' ? BALANCED_SQUAT : STRICT_SQUAT
  }

  // Rebuild counters when mode changes
  useEffect(() => {
    modeRef.current = mode
    repCounterRef.current    = new RepCounter(pullupThreshold(mode))
    pushupCounterRef.current = new PushupCounter(pushupThreshold(mode))
    squatCounterRef.current  = new SquatCounter(squatThreshold(mode))
    setRepCount(0)
    repCountRef.current = 0
    lastHapticRef.current = 0
    formCoachRef.current.reset()
    poseValidatorRef.current.reset()
    elbowSmootherRef.current.reset()
    kneeSmootherRef.current.reset()
    setPoseInvalid(null)
  }, [mode])

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    detectorRef.current?.close?.()
    detectorRef.current = null
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
    // Reset smoothers on camera switch — different perspective can yield different angle offsets
    elbowSmootherRef.current.reset()
    kneeSmootherRef.current.reset()

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

      // Only initialize MediaPipe once — reuse cached detector on camera flips
      if (!detectorRef.current) {
        const vision = await import('@mediapipe/tasks-vision')
        const { PoseLandmarker, FilesetResolver } = vision
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )
        const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
        detectorRef.current = poseLandmarker
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

        // Mirror the canvas draw for front camera so video + skeleton both flip
        ctx.save()
        if (facingModeRef.current === 'user') {
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(video, 0, 0)
        ctx.restore()

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          const result = detectorRef.current!.detectForVideo(video, time)
          if (result.landmarks.length > 0) {
            processFrame(result.landmarks[0], ctx, canvas.width, canvas.height)
          }
        }
        animRef.current = requestAnimationFrame(detect)
      }
      animRef.current = requestAnimationFrame(detect)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare cameră')
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
    const currentMode = modeRef.current
    const usesBest = currentMode !== 'strict' // balanced and easy use best-side angle

    // Pose validation (skip counting if not in position — except easy mode which only warns)
    const poseCheck = poseValidatorRef.current.validate(lms, exerciseType)
    if (!poseCheck.valid && currentMode !== 'easy') {
      drawSkeleton(ctx, lms, w, h, '#6B7280')
      setPoseInvalid(poseCheck.reason ?? null)
      setStateLabel('Pregătire...')
      setStateColor('#6B7280')
      setFormCues([])
      return
    }
    setPoseInvalid(currentMode === 'easy' && !poseCheck.valid ? poseCheck.reason ?? null : null)

    if (exerciseType === 'pullup') {
      const rawElbow = usesBest
        ? bestElbowAngle(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
        : avgElbowAngle(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
      const elbow = elbowSmootherRef.current.smooth(rawElbow)
      const elbowVel = elbowSmootherRef.current.getVelocity()
      const cs = repCounterRef.current.update(elbow)
      drawSkeleton(ctx, lms, w, h, STATE_COLORS[cs.state] ?? '#1ED75F')
      triggerHaptic(cs.repCount)
      setRepCount(cs.repCount); repCountRef.current = cs.repCount
      setPrimaryAngle(Math.round(elbow))
      setStateLabel(STATE_LABELS[cs.state])
      setStateColor(STATE_COLORS[cs.state])
      setFormCues(formCoachRef.current.getFormCues(lms, 'pullup', cs.state))
      setAngleVelocity(elbowVel)
      const t = pullupThreshold(modeRef.current)
      setArcProgress(Math.max(0, Math.min(1, (t.hangEnter - elbow) / (t.hangEnter - t.peak))))

    } else if (exerciseType === 'pushup') {
      const rawElbow = usesBest
        ? bestElbowAngle(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
        : avgElbowAngle(lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST], lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST])
      const elbow = elbowSmootherRef.current.smooth(rawElbow)
      const elbowVel = elbowSmootherRef.current.getVelocity()
      const cs = pushupCounterRef.current.update(elbow)
      drawSkeleton(ctx, lms, w, h, '#F97316')
      triggerHaptic(cs.repCount)
      setRepCount(cs.repCount); repCountRef.current = cs.repCount
      setPrimaryAngle(Math.round(elbow))
      setStateLabel(PUSHUP_STATE_LABELS[cs.state])
      setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
      setFormCues(formCoachRef.current.getFormCues(lms, 'pushup', cs.state))
      setAngleVelocity(elbowVel)
      const pt = pushupThreshold(modeRef.current)
      setArcProgress(Math.max(0, Math.min(1, (pt.upAngle - elbow) / (pt.upAngle - pt.downAngle))))

    } else {
      const rawKnee = usesBest
        ? bestKneeAngle(lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE], lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE])
        : avgKneeAngle(lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE], lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE])
      const knee = kneeSmootherRef.current.smooth(rawKnee)
      const kneeVel = kneeSmootherRef.current.getVelocity()
      const cs = squatCounterRef.current.update(knee)
      drawSkeleton(ctx, lms, w, h, '#3B82F6')
      triggerHaptic(cs.repCount)
      setRepCount(cs.repCount); repCountRef.current = cs.repCount
      setPrimaryAngle(Math.round(knee))
      setStateLabel(SQUAT_STATE_LABELS[cs.state])
      setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
      setFormCues(formCoachRef.current.getFormCues(lms, 'squat', cs.state))
      setAngleVelocity(kneeVel)
      const st = squatThreshold(modeRef.current)
      setArcProgress(Math.max(0, Math.min(1, (st.upAngle - knee) / (st.upAngle - st.downAngle))))
    }
  }

  function triggerHaptic(count: number) {
    if (count > lastHapticRef.current) {
      lastHapticRef.current = count
      navigator.vibrate?.(30)
    }
  }

  function handleModeToggle(newMode: 'strict' | 'balanced' | 'easy') {
    if (newMode === mode) return
    setMode(newMode)
    if (newMode !== 'strict') {
      setModeToast(true)
      setTimeout(() => setModeToast(false), 2000)
    }
  }

  function handleCameraFlip() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    facingModeRef.current = next
    setFacingMode(next)
    startCamera(next)
  }

  // Suppress "declared but never used" for state types
  void (null as unknown as RepState | PushupState | SquatState)

  const angleLabel = exerciseType === 'squat' ? 'Unghi genunchi' : 'Unghi cot'

  // ── Inline sub-components ──────────────────────────────────────────────────

  function AngleArc() {
    const fullArcD = 'M 5,45 A 35,35 0 0,1 75,45'
    const theta = Math.PI - arcProgress * Math.PI
    const dotX = 40 + 35 * Math.cos(theta)
    const dotY = 45 - 35 * Math.sin(theta)
    const largeArcFlag = arcProgress > 0.5 ? 1 : 0
    const activeArcD = arcProgress > 0.01
      ? `M 5,45 A 35,35 0 ${largeArcFlag},1 ${dotX.toFixed(1)},${dotY.toFixed(1)}`
      : ''

    return (
      <div className="flex flex-col items-start gap-0">
        <span className="text-[10px] text-white/40">{angleLabel}</span>
        <svg width="80" height="50" viewBox="0 0 80 50" className="overflow-visible">
          {/* Background track */}
          <path d={fullArcD} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" strokeLinecap="round" />
          {/* Active progress arc */}
          {activeArcD && (
            <path d={activeArcD} fill="none" stroke="#1ED75F" strokeWidth="4" strokeLinecap="round" />
          )}
          {/* Moving indicator dot */}
          <circle cx={dotX} cy={dotY} r="5" fill="#1ED75F" />
          <circle cx={dotX} cy={dotY} r="3" fill="white" />
        </svg>
        <span className="text-lg font-black text-white tabular-nums -mt-1">{primaryAngle}°</span>
      </div>
    )
  }

  function VelocityIndicator() {
    if (Math.abs(angleVelocity) < 0.8) return null
    const arrow = angleVelocity < 0 ? '↓' : '↑'
    // Negative velocity = joint bending (correct direction for pulling/squatting)
    const color = angleVelocity < 0 ? '#1ED75F' : 'rgba(255,255,255,0.5)'
    return (
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {arrow} {Math.abs(angleVelocity).toFixed(1)}°/f
      </span>
    )
  }

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

      {/* Header: exercise name + mode toggle + camera flip + close */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-safe pt-4 pb-3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0"
        >
          <X size={16} className="text-white/80" />
        </button>
        <p className="font-black text-white text-base flex-1 min-w-0 truncate">{exerciseName}</p>
        {/* Mode toggle pill */}
        <div className="flex items-center bg-white/10 border border-white/20 rounded-full p-0.5 flex-shrink-0">
          <button
            onClick={() => handleModeToggle('strict')}
            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${mode === 'strict' ? 'bg-brand-green text-black' : 'text-white/50'}`}
          >
            Strict
          </button>
          <button
            onClick={() => handleModeToggle('balanced')}
            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${mode === 'balanced' ? 'bg-brand-green text-black' : 'text-white/50'}`}
          >
            Balansat
          </button>
          <button
            onClick={() => handleModeToggle('easy')}
            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${mode === 'easy' ? 'bg-brand-green text-black' : 'text-white/50'}`}
          >
            Ușor
          </button>
        </div>
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

      {/* Easy mode toast */}
      {modeToast && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="px-3 py-1.5 rounded-full bg-brand-green/20 border border-brand-green/40">
            <span className="text-xs font-bold text-brand-green">
              {mode === 'balanced' ? 'Mod balansat — permisiv dar verifică poziția' : 'Modul ușor activ — unghiuri relaxate'}
            </span>
          </div>
        </div>
      )}

      {/* Rep count (top center) */}
      {!loading && !error && (
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center z-10 pointer-events-none"
          style={{ marginTop: modeToast ? 28 : 0, transition: 'margin-top 0.2s' }}>
          <span
            className="text-7xl font-black text-white tabular-nums"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
          >
            {repCount}
          </span>
          <span className="text-xs font-bold text-white/60 tracking-widest mt-0.5">REPETĂRI</span>
          <div className="mt-2 px-3 py-1 rounded-full"
            style={{ backgroundColor: `${stateColor}33`, border: `1px solid ${stateColor}66` }}>
            <span className="text-xs font-bold" style={{ color: stateColor }}>{stateLabel}</span>
          </div>
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
                onClick={onCancel}
                className="mt-2 h-10 px-6 rounded-full border border-white/20 text-sm text-white/70"
              >
                Înapoi
              </button>
            </>
          )}
        </div>
      )}

      {/* Pose invalid overlay */}
      {!loading && poseInvalid && (
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

      {/* Angle arc gauge + velocity indicator */}
      {!loading && (
        <div className="absolute bottom-[84px] left-4 z-10 flex flex-col gap-1">
          <AngleArc />
          <VelocityIndicator />
        </div>
      )}

      {/* Action bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex gap-3 px-4 pb-8 pt-4"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 60%, transparent)' }}
      >
        <button
          onClick={onCancel}
          className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          <X size={20} className="text-white/70" />
        </button>
        <button
          onClick={() => { if (repCountRef.current > 0) onConfirm(repCountRef.current) }}
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
