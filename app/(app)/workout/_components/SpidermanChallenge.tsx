'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { X, CheckCircle } from 'lucide-react'
import SpidermanCameraView from '@/components/challenge/SpidermanCameraView'
import { useBattleAudio } from '@/lib/battle/useBattleAudio'
import { useT } from '@/lib/context/LanguageContext'
import type { ExerciseType } from '@/lib/ml/form-coach'
import type { WorkoutExercise } from '@/types'

// ── Circuit definition ─────────────────────────────────────────────────────
const SPIDERMAN_CIRCUIT = [
  { type: 'pullup' as ExerciseType, name: 'Tracțiuni',  targetReps: 5,  emoji: '🦾' },
  { type: 'pushup' as ExerciseType, name: 'Flotări',    targetReps: 10, emoji: '💪' },
  { type: 'squat'  as ExerciseType, name: 'Squaturi',   targetReps: 15, emoji: '🦵' },
]
const CHALLENGE_DURATION = 20 * 60 // 20 minutes in seconds
const COUNTDOWN_SECONDS = 3
const TRANSITION_MS = 1800

export type SpidermanMode = 'amrap' | 'timer'

export interface SpidermanResult {
  completedRounds: number
  partialExerciseIndex: number // how far into the partial round (0-2)
  totalReps: { pullup: number; pushup: number; squat: number }
  durationSeconds: number
  exercises: WorkoutExercise[]
}

interface Props {
  mode: SpidermanMode
  onComplete: (result: SpidermanResult) => void
  onCancel: () => void
}

type Phase = 'countdown' | 'active' | 'transition' | 'finished' | 'confirm-quit'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function SpidermanChallenge({ mode, onComplete, onCancel }: Props) {
  const t = useT()
  const { playTick, playGo, playFinish, vibrate } = useBattleAudio()

  // Phase
  const [phase, setPhase] = useState<Phase>('countdown')
  const [countdownNum, setCountdownNum] = useState(COUNTDOWN_SECONDS)

  // Exercise state
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [currentReps, setCurrentReps] = useState(0)
  const [completedRounds, setCompletedRounds] = useState(0)
  const [resetKey, setResetKey] = useState(0)

  // Timer
  const isTimerMode = mode === 'timer'
  const [timeRemaining, setTimeRemaining] = useState(CHALLENGE_DURATION)
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Accumulated totals (ref for hot-path, state for UI)
  const totalRepsRef = useRef({ pullup: 0, pushup: 0, squat: 0 })
  const [totalRepsState, setTotalRepsState] = useState({ pullup: 0, pushup: 0, squat: 0 })

  // Camera readiness
  const [cameraReady, setCameraReady] = useState(false)

  // Transition overlay
  const [transitionExercise, setTransitionExercise] = useState<typeof SPIDERMAN_CIRCUIT[0] | null>(null)

  // Refs to prevent stale closures
  const phaseRef = useRef(phase)
  const exerciseIndexRef = useRef(exerciseIndex)
  const completedRoundsRef = useRef(completedRounds)
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { exerciseIndexRef.current = exerciseIndex }, [exerciseIndex])
  useEffect(() => { completedRoundsRef.current = completedRounds }, [completedRounds])

  const exercise = SPIDERMAN_CIRCUIT[exerciseIndex]

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown' || !cameraReady) return

    if (countdownNum <= 0) {
      playGo()
      vibrate([100, 50, 100])
      setPhase('active')
      return
    }

    playTick()
    const timeout = setTimeout(() => setCountdownNum(n => n - 1), 1000)
    return () => clearTimeout(timeout)
  }, [phase, countdownNum, cameraReady, playTick, playGo, vibrate])

  // ── Timer (wall-clock based) ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' && phase !== 'transition') return

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now()
    }

    timerRef.current = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTimeRef.current!) / 1000)

      if (isTimerMode) {
        setElapsed(elapsedSec)
      } else {
        const remaining = Math.max(0, CHALLENGE_DURATION - elapsedSec)
        setTimeRemaining(remaining)

        if (remaining <= 0) {
          setPhase('finished')
          playFinish()
          vibrate([200, 100, 200, 100, 400])
        }
      }
    }, 250) // update frequently for smooth display

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase, isTimerMode, playFinish, vibrate])

  // ── Exercise transition ────────────────────────────────────────────────────
  const triggerTransition = useCallback(() => {
    if (phaseRef.current === 'finished') return

    const nextIndex = (exerciseIndexRef.current + 1) % 3
    const isNewRound = nextIndex === 0

    setPhase('transition')
    setTransitionExercise(SPIDERMAN_CIRCUIT[nextIndex])

    playGo()
    vibrate([80, 40, 80])

    setTimeout(() => {
      if (isNewRound) {
        setCompletedRounds(prev => prev + 1)
      }

      setExerciseIndex(nextIndex)
      setCurrentReps(0)
      setResetKey(prev => prev + 1)
      setTransitionExercise(null)
      setPhase('active')
    }, TRANSITION_MS)
  }, [playGo, vibrate])

  // ── Rep counted callback ───────────────────────────────────────────────────
  const handleRepCounted = useCallback((newCount: number) => {
    if (phaseRef.current !== 'active') return

    setCurrentReps(newCount)

    const exType = SPIDERMAN_CIRCUIT[exerciseIndexRef.current].type
    totalRepsRef.current[exType] = totalRepsRef.current[exType] + 1
    setTotalRepsState({ ...totalRepsRef.current })

    const target = SPIDERMAN_CIRCUIT[exerciseIndexRef.current].targetReps
    if (newCount >= target) {
      triggerTransition()
    }
  }, [triggerTransition])

  // ── Build result ───────────────────────────────────────────────────────────
  function buildResult(): SpidermanResult {
    const totals = totalRepsRef.current
    const exercises: WorkoutExercise[] = []

    if (totals.pullup > 0) {
      exercises.push({
        name: 'Tracțiuni', category: 'Trageri',
        sets: [{ reps: totals.pullup, recorded: true }],
      })
    }
    if (totals.pushup > 0) {
      exercises.push({
        name: 'Flotări', category: 'Împingeri',
        sets: [{ reps: totals.pushup, recorded: true }],
      })
    }
    if (totals.squat > 0) {
      exercises.push({
        name: 'Squaturi', category: 'Picioare',
        sets: [{ reps: totals.squat, recorded: true }],
      })
    }

    const durationSeconds = isTimerMode
      ? elapsed
      : CHALLENGE_DURATION - timeRemaining

    return {
      completedRounds: completedRoundsRef.current,
      partialExerciseIndex: exerciseIndexRef.current,
      totalReps: { ...totalRepsRef.current },
      durationSeconds,
      exercises,
    }
  }

  // ── Manual finish (timer mode) ──────────────────────────────────────────────
  function handleFinish() {
    setPhase('finished')
    playFinish()
    vibrate([200, 100, 200, 100, 400])
  }

  // ── Quit confirmation ──────────────────────────────────────────────────────
  function handleClose() {
    if (phase === 'finished') {
      onCancel()
      return
    }
    setPhase('confirm-quit')
  }

  function handleQuitConfirm() {
    onCancel()
  }

  function handleQuitCancel() {
    setPhase('active')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const grandTotal = totalRepsState.pullup + totalRepsState.pushup + totalRepsState.squat

  return (
    <div className="fixed inset-0 z-[60]">
      <SpidermanCameraView
        exerciseType={exercise.type}
        resetKey={resetKey}
        onRepCounted={handleRepCounted}
        onCameraReady={() => setCameraReady(true)}
      >
        {/* ── Top bar ── */}
        <div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3 pb-6"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}
        >
          {/* Close */}
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-black/50 border border-white/15 flex items-center justify-center"
          >
            <X size={18} className="text-white/80" />
          </button>

          {/* Timer */}
          <div className="flex flex-col items-center">
            <span
              className={`text-2xl font-black tabular-nums ${!isTimerMode && timeRemaining <= 60 ? 'text-red-400' : 'text-white'}`}
              style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
            >
              {formatTime(isTimerMode ? elapsed : timeRemaining)}
            </span>
          </div>

          {/* Round counter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 border border-white/15">
            <Image src="/icons/marvel.png" alt="Spiderman" width={18} height={18} className="inline-block" />
            <span className="text-sm font-black text-white tabular-nums">
              {t('spiderman.round')} {completedRounds + 1}
            </span>
          </div>
        </div>

        {/* ── Exercise indicator (center-top) ── */}
        {phase === 'active' && (
          <div className="absolute top-20 left-0 right-0 z-10 flex flex-col items-center pointer-events-none">
            {/* Exercise name + emoji */}
            <div
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-white/10"
            >
              <span className="text-2xl">{exercise.emoji}</span>
              <span
                className="text-lg font-black text-white uppercase tracking-wide"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                {exercise.name}
              </span>
            </div>

            {/* Circuit progress dots */}
            <div className="flex gap-2 mt-3">
              {SPIDERMAN_CIRCUIT.map((ex, i) => (
                <div
                  key={ex.type}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    i < exerciseIndex
                      ? 'bg-green-400 scale-100'
                      : i === exerciseIndex
                        ? 'bg-white scale-125'
                        : 'bg-white/25 scale-100'
                  }`}
                />
              ))}
            </div>

            {/* Sets completed badge */}
            {completedRounds > 0 && (
              <div className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30">
                <CheckCircle size={12} className="text-green-400" />
                <span className="text-xs font-bold text-green-400">
                  {completedRounds} {completedRounds === 1 ? 'set' : 'sets'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Rep counter (bottom) ── */}
        {phase === 'active' && (
          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center z-10">
            {/* Finish button — timer mode only */}
            {isTimerMode && (
              <button
                onClick={handleFinish}
                className="mb-4 px-8 py-3 rounded-2xl font-black text-sm text-white active:scale-95 transition-transform"
                style={{ backgroundColor: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.5)' }}
              >
                {t('spiderman.finish_btn')}
              </button>
            )}
            <div className="flex items-baseline gap-1 pointer-events-none">
              <span
                className="text-7xl font-black text-white tabular-nums"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
              >
                {currentReps}
              </span>
              <span
                className="text-3xl font-bold text-white/50 tabular-nums"
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
              >
                / {exercise.targetReps}
              </span>
            </div>
          </div>
        )}

        {/* ── Countdown overlay ── */}
        {phase === 'countdown' && cameraReady && (
          <div className="absolute inset-0 z-30 bg-black/60 flex flex-col items-center justify-center">
            <p className="text-lg font-bold text-white/60 mb-2">{t('spiderman.get_ready')}</p>
            <span className="text-8xl font-black text-white animate-pulse">
              {countdownNum > 0 ? countdownNum : 'GO!'}
            </span>
            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/10">
              <Image src="/icons/marvel.png" alt="Spiderman" width={24} height={24} />
              <span className="text-sm font-bold text-white/70">Spiderman Challenge</span>
            </div>
          </div>
        )}

        {/* ── Transition overlay ── */}
        {phase === 'transition' && transitionExercise && (
          <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={24} className="text-green-400" />
              <span className="text-lg font-bold text-green-400">
                {exercise.name} ✓
              </span>
            </div>

            <p className="text-sm font-semibold text-white/50 mb-2">{t('spiderman.next_up')}</p>

            <div className="flex items-center gap-3 animate-bounce">
              <span className="text-5xl">{transitionExercise.emoji}</span>
            </div>
            <p
              className="text-3xl font-black text-white mt-3 uppercase tracking-wide"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
            >
              {transitionExercise.name}
            </p>
            <p className="text-lg font-bold text-white/50 mt-1">
              {transitionExercise.targetReps} reps
            </p>

            {/* Show if new round */}
            {(exerciseIndexRef.current + 1) % 3 === 0 && (
              <div className="mt-4 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-400/30">
                <span className="text-sm font-bold text-purple-300">
                  <Image src="/icons/marvel.png" alt="Spiderman" width={16} height={16} className="inline-block mr-1" />{t('spiderman.round')} {completedRounds + 2}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Quit confirmation ── */}
        {phase === 'confirm-quit' && (
          <div className="absolute inset-0 z-40 bg-black/70 flex items-center justify-center">
            <div className="bg-[var(--app-surface)] rounded-2xl p-6 mx-6 max-w-sm w-full border border-white/10">
              <p className="text-lg font-bold text-white text-center mb-4">{t('spiderman.quit_title')}</p>
              <div className="flex gap-3">
                <button
                  onClick={handleQuitCancel}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  {t('spiderman.quit_no')}
                </button>
                <button
                  onClick={handleQuitConfirm}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm bg-red-500/80"
                >
                  {t('spiderman.quit_yes')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Finished summary ── */}
        {phase === 'finished' && (
          <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-[var(--app-surface)] rounded-2xl p-6 mx-4 max-w-sm w-full border border-white/10">
              {/* Header */}
              <div className="text-center mb-5">
                <Image src="/icons/marvel.png" alt="Spiderman" width={48} height={48} />
                <h2 className="text-xl font-black text-white mt-2">
                  {isTimerMode ? t('spiderman.well_done') : t('spiderman.time_up')}
                </h2>
              </div>

              {/* Elapsed time (timer mode) */}
              {isTimerMode && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-sm font-semibold text-white/50">{t('spiderman.elapsed')}</span>
                  <span className="text-lg font-black text-white tabular-nums">{formatTime(elapsed)}</span>
                </div>
              )}

              {/* Rounds */}
              <div className="text-center mb-5">
                <span className="text-5xl font-black text-purple-400">{completedRounds}</span>
                <p className="text-sm font-semibold text-white/50 mt-1">{t('spiderman.rounds_done')}</p>
              </div>

              {/* Breakdown */}
              <div className="flex gap-2 mb-4">
                {SPIDERMAN_CIRCUIT.map(ex => (
                  <div key={ex.type} className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <span className="text-lg">{ex.emoji}</span>
                    <p className="text-lg font-black text-white mt-1">
                      {totalRepsState[ex.type]}
                    </p>
                    <p className="text-[10px] text-white/40 font-semibold">{ex.name}</p>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <span className="text-sm font-semibold text-white/50">{t('spiderman.total_reps')}</span>
                <span className="text-lg font-black text-white">{grandTotal}</span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onComplete(buildResult())}
                  className="w-full py-3.5 rounded-xl font-black text-black text-sm"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {t('spiderman.save')}
                </button>
                <button
                  onClick={onCancel}
                  className="w-full py-3 rounded-xl font-bold text-white/50 text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                  {t('spiderman.discard')}
                </button>
              </div>
            </div>
          </div>
        )}
      </SpidermanCameraView>
    </div>
  )
}
