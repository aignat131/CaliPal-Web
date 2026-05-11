'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Check, Camera } from 'lucide-react'
import {
  RepCounter, STATE_LABELS, STATE_COLORS,
  PushupCounter, PUSHUP_STATE_LABELS,
  SquatCounter, SQUAT_STATE_LABELS,
} from '@/lib/ml/rep-counter'
import type { RepState, PushupState, SquatState } from '@/lib/ml/rep-counter'
import { avgElbowAngle, avgKneeAngle, MP } from '@/lib/ml/pose-math'
import type { Landmark } from '@/lib/ml/pose-math'
import { FormCoach } from '@/lib/ml/form-coach'
import type { ExerciseType, FormCue } from '@/lib/ml/form-coach'
import { drawSkeleton, POSE_CONNECTIONS } from '@/lib/ml/skeleton-draw'

// keep linter happy — POSE_CONNECTIONS imported to ensure tree-shaking keeps it
void POSE_CONNECTIONS

const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

interface Props {
  exerciseType: ExerciseType
  exerciseName: string
  onConfirm: (reps: number) => void
  onCancel: () => void
}

export default function RepCounterModal({ exerciseType, exerciseName, onConfirm, onCancel }: Props) {
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

  const [repCount, setRepCount]         = useState(0)
  const [primaryAngle, setPrimaryAngle] = useState(0)
  const [stateLabel, setStateLabel]     = useState('Pregătire...')
  const [stateColor, setStateColor]     = useState('#6B7280')
  const [formCues, setFormCues]         = useState<FormCue[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  // Use ref so the rAF loop always reads the latest repCount without closure staleness
  const repCountRef = useRef(0)

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    detectorRef.current?.close?.()
    detectorRef.current = null
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setError('')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
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
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
        if (cancelled) { poseLandmarker.close(); return }
        detectorRef.current = poseLandmarker
        setLoading(false)

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
            const result = detectorRef.current!.detectForVideo(video, time)
            if (result.landmarks.length > 0) {
              processFrame(result.landmarks[0], ctx, canvas.width, canvas.height)
            }
          }
          animRef.current = requestAnimationFrame(detect)
        }
        animRef.current = requestAnimationFrame(detect)
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
    if (exerciseType === 'pullup') {
      const elbow = avgElbowAngle(
        lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
        lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
      )
      const cs = repCounterRef.current.update(elbow)
      drawSkeleton(ctx, lms, w, h, STATE_COLORS[cs.state] ?? '#1ED75F')
      triggerHaptic(cs.repCount)
      setRepCount(cs.repCount); repCountRef.current = cs.repCount
      setPrimaryAngle(Math.round(elbow))
      setStateLabel(STATE_LABELS[cs.state])
      setStateColor(STATE_COLORS[cs.state])
      setFormCues(formCoachRef.current.getFormCues(lms, 'pullup', cs.state))

    } else if (exerciseType === 'pushup') {
      const elbow = avgElbowAngle(
        lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
        lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
      )
      const cs = pushupCounterRef.current.update(elbow)
      drawSkeleton(ctx, lms, w, h, '#F97316')
      triggerHaptic(cs.repCount)
      setRepCount(cs.repCount); repCountRef.current = cs.repCount
      setPrimaryAngle(Math.round(elbow))
      setStateLabel(PUSHUP_STATE_LABELS[cs.state])
      setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
      setFormCues(formCoachRef.current.getFormCues(lms, 'pushup', cs.state))

    } else {
      const knee = avgKneeAngle(
        lms[MP.LEFT_HIP], lms[MP.LEFT_KNEE], lms[MP.LEFT_ANKLE],
        lms[MP.RIGHT_HIP], lms[MP.RIGHT_KNEE], lms[MP.RIGHT_ANKLE]
      )
      const cs = squatCounterRef.current.update(knee)
      drawSkeleton(ctx, lms, w, h, '#3B82F6')
      triggerHaptic(cs.repCount)
      setRepCount(cs.repCount); repCountRef.current = cs.repCount
      setPrimaryAngle(Math.round(knee))
      setStateLabel(SQUAT_STATE_LABELS[cs.state])
      setStateColor(cs.state === 'UP' ? '#1ED75F' : cs.state === 'DOWN' ? '#F59E0B' : '#6B7280')
      setFormCues(formCoachRef.current.getFormCues(lms, 'squat', cs.state))
    }
  }

  function triggerHaptic(count: number) {
    if (count > lastHapticRef.current) {
      lastHapticRef.current = count
      navigator.vibrate?.(30)
    }
  }

  // Unused RepState type ref — suppress "declared but never used" for PushupState/SquatState
  void (null as unknown as RepState | PushupState | SquatState)

  const angleLabel = exerciseType === 'squat' ? 'Unghi genunchi' : 'Unghi cot'

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Camera feed */}
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      {/* Header: exercise name + close */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 pt-safe pt-4 pb-3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}>
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center"
        >
          <X size={16} className="text-white/80" />
        </button>
        <p className="font-black text-white text-base flex-1">{exerciseName}</p>
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

      {/* Form cue banners */}
      {!loading && formCues.length > 0 && (
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

      {/* Angle display */}
      {!loading && (
        <div className="absolute bottom-[84px] left-4 z-10">
          <span className="text-[10px] text-white/40 block mb-0.5">{angleLabel}</span>
          <span className="text-2xl font-black text-white tabular-nums">{primaryAngle}°</span>
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
