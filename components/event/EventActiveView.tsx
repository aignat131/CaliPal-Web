'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, Video, StopCircle } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import type { EventDoc, EventParticipantDoc } from '@/lib/event/types'
import type { ExerciseType } from '@/lib/ml/form-coach'
import EventLeaderboard from './EventLeaderboard'
import RepCounterModal from '@/components/workout/RepCounterModal'
import UnifiedRepCounterModal from '@/components/workout/UnifiedRepCounterModal'
import type { UnifiedResult } from '@/components/workout/UnifiedRepCounterModal'

const EXERCISE_COLORS: Record<string, string> = {
  pushup: '#F97316',
  pullup: '#1ED75F',
  squat: '#3B82F6',
}

interface Props {
  event: EventDoc
  sortedParticipants: EventParticipantDoc[]
  myParticipant: EventParticipantDoc | null
  isHost: boolean
  currentUid: string
  isSpectator?: boolean
  onIncrementReps: (exerciseName: string, newCount: number) => Promise<void>
  onFinish: () => void
}

export default function EventActiveView({
  event, sortedParticipants, myParticipant, isHost, currentUid,
  isSpectator, onIncrementReps, onFinish,
}: Props) {
  const t = useT()
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number>(
    event.startedAt ? event.startedAt.toDate().getTime() : Date.now()
  )

  // Modal state
  const [singleRecordExercise, setSingleRecordExercise] = useState<{
    exerciseName: string
    exerciseType: ExerciseType
  } | null>(null)
  const [showUnifiedRecorder, setShowUnifiedRecorder] = useState(false)

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const durationSeconds = event.durationMinutes ? event.durationMinutes * 60 : null
  const remaining = durationSeconds ? Math.max(0, durationSeconds - elapsed) : null
  const isTimeUp = remaining !== null && remaining <= 0

  // Auto-finish when time's up
  useEffect(() => {
    if (isTimeUp && isHost) {
      onFinish()
    }
  }, [isTimeUp, isHost, onFinish])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Single exercise recording confirm
  const handleSingleRecordConfirm = useCallback(async (reps: number, _durationSeconds: number) => {
    if (!singleRecordExercise) return
    const current = myParticipant?.reps[singleRecordExercise.exerciseName] ?? 0
    await onIncrementReps(singleRecordExercise.exerciseName, current + reps)
    setSingleRecordExercise(null)
  }, [singleRecordExercise, myParticipant?.reps, onIncrementReps])

  // Full recording confirm — match detected exercises to event exercises by type
  const handleUnifiedRecordConfirm = useCallback(async (result: UnifiedResult) => {
    for (const detected of result.exercises) {
      const eventEx = event.exercises.find(ex => ex.exerciseType === detected.type)
      if (eventEx && detected.reps > 0) {
        const current = myParticipant?.reps[eventEx.name] ?? 0
        await onIncrementReps(eventEx.name, current + detected.reps)
      }
    }
    setShowUnifiedRecorder(false)
  }, [event.exercises, myParticipant?.reps, onIncrementReps])

  const hasRecordableExercises = event.exercises.some(ex => ex.exerciseType)

  return (
    <div className="px-4 py-4 pb-24">
      {/* Timer — centered */}
      <div className="text-center mb-4 max-w-lg mx-auto">
        <h2 className="text-lg font-black text-white/90 mb-1">{event.name}</h2>
        {remaining !== null ? (
          <div className={`text-3xl font-black font-mono ${remaining <= 30 ? 'text-red-400' : 'text-amber-400'}`}>
            {formatTime(remaining)}
          </div>
        ) : (
          <div className="text-sm text-white/40">
            {formatTime(elapsed)} · {t('event.open_ended')}
          </div>
        )}
      </div>

      {/* Two-column layout on desktop */}
      <div className="md:flex md:gap-6 md:items-start">
        {/* Leaderboard — full width on desktop, capped height on mobile so buttons stay visible */}
        <div className="md:flex-1 md:min-w-0 mb-5 md:mb-0">
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('event.leaderboard').toUpperCase()}</p>
          <div className="rounded-2xl p-3 border border-white/8 max-h-[40vh] md:max-h-none overflow-y-auto" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <EventLeaderboard sortedParticipants={sortedParticipants} currentUid={currentUid} />
          </div>
        </div>

        {/* Exercise controls — narrow column on desktop */}
        {!isSpectator && (
          <div className="md:w-96 md:flex-shrink-0">
            {/* Your score summary */}
            {myParticipant && (
              <div className="text-center mb-4">
                <span className="text-xs text-white/40">{t('event.your_score')}: </span>
                <span className="text-lg font-black text-amber-400">{myParticipant.totalPoints}</span>
                <span className="text-xs text-white/40"> {t('event.points')}</span>
              </div>
            )}

            {/* Exercise recording buttons */}
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('event.exercises').toUpperCase()}</p>
            <div className="space-y-3 mb-4">
              {event.exercises.map(ex => {
                const myReps = myParticipant?.reps[ex.name] ?? 0
                const color = EXERCISE_COLORS[ex.exerciseType ?? ''] ?? '#9CA3AF'

                return (
                  <button
                    key={ex.name}
                    onClick={() => {
                      if (ex.exerciseType) {
                        setSingleRecordExercise({
                          exerciseName: ex.name,
                          exerciseType: ex.exerciseType as ExerciseType,
                        })
                      }
                    }}
                    disabled={!ex.exerciseType}
                    className="w-full rounded-2xl p-4 border transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none text-left"
                    style={{
                      backgroundColor: `${color}08`,
                      borderColor: `${color}25`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}18` }}
                      >
                        <Camera size={22} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white/90">{ex.name}</p>
                        <p className="text-[11px] text-white/40">
                          {ex.pointsPerRep} {t('event.points')}/rep
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-2xl font-black" style={{ color }}>{myReps}</p>
                        <p className="text-[10px] text-white/40">{t('event.reps')}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Full Recording button */}
            {hasRecordableExercises && (
              <button
                onClick={() => setShowUnifiedRecorder(true)}
                className="w-full h-14 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 mb-6 transition-all active:scale-[0.97]"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#000',
                }}
              >
                <Video size={20} />
                {t('event.full_recording')}
              </button>
            )}

            {/* End Event — host only */}
            {isHost && (
              <button
                onClick={onFinish}
                className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-all active:scale-[0.97]"
              >
                <StopCircle size={16} />
                {t('event.end_event')}
              </button>
            )}
          </div>
        )}

        {/* Spectator banner */}
        {isSpectator && (
          <div className="md:w-80 md:flex-shrink-0">
            <div className="text-center py-8 rounded-2xl border border-white/8" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <p className="text-sm text-white/50">{t('event.spectator_mode')}</p>
              <p className="text-xs text-white/30 mt-1">{t('event.login_to_join')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Compact floating leaderboard for 6+ participants — mobile only */}
      {sortedParticipants.length >= 6 && (
        <div
          className="md:hidden fixed bottom-24 left-4 z-30 rounded-xl p-2.5 backdrop-blur-lg"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {sortedParticipants.slice(0, 3).map((p, i) => {
            const MEDALS = ['🥇', '🥈', '🥉']
            return (
              <div key={p.uid} className="flex items-center gap-2 py-0.5">
                <span className="text-xs">{MEDALS[i]}</span>
                <span className="text-xs font-bold text-amber-400">{p.totalPoints}</span>
                <span className="text-[10px] text-white/50 truncate max-w-[60px]">{p.displayName}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Single exercise recording modal */}
      {singleRecordExercise && (
        <RepCounterModal
          exerciseType={singleRecordExercise.exerciseType}
          exerciseName={singleRecordExercise.exerciseName}
          onConfirm={handleSingleRecordConfirm}
          onCancel={() => setSingleRecordExercise(null)}
        />
      )}

      {/* Full recording modal (auto-detect all exercises) */}
      {showUnifiedRecorder && (
        <UnifiedRepCounterModal
          onConfirm={handleUnifiedRecordConfirm}
          onCancel={() => setShowUnifiedRecorder(false)}
        />
      )}
    </div>
  )
}
