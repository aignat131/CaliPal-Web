'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, Plus, StopCircle } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import type { EventDoc, EventParticipantDoc } from '@/lib/event/types'
import EventLeaderboard from './EventLeaderboard'

interface Props {
  event: EventDoc
  sortedParticipants: EventParticipantDoc[]
  myParticipant: EventParticipantDoc | null
  isHost: boolean
  currentUid: string
  onIncrementReps: (exerciseName: string, newCount: number) => Promise<void>
  onFinish: () => void
}

export default function EventActiveView({
  event, sortedParticipants, myParticipant, isHost, currentUid,
  onIncrementReps, onFinish,
}: Props) {
  const t = useT()
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number>(
    event.startedAt ? event.startedAt.toDate().getTime() : Date.now()
  )

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

  const handleAdd = useCallback(async (exerciseName: string, amount: number) => {
    const current = myParticipant?.reps[exerciseName] ?? 0
    await onIncrementReps(exerciseName, current + amount)
  }, [myParticipant?.reps, onIncrementReps])

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      {/* Timer */}
      <div className="text-center mb-4">
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

      {/* Live leaderboard */}
      <div className="mb-5">
        <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('event.leaderboard').toUpperCase()}</p>
        <div className="rounded-2xl p-3 border border-white/8" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
          <EventLeaderboard sortedParticipants={sortedParticipants} currentUid={currentUid} />
        </div>
      </div>

      {/* Your score summary */}
      {myParticipant && (
        <div className="text-center mb-4">
          <span className="text-xs text-white/40">{t('event.your_score')}: </span>
          <span className="text-lg font-black text-amber-400">{myParticipant.totalPoints}</span>
          <span className="text-xs text-white/40"> {t('event.points')}</span>
        </div>
      )}

      {/* Exercise rep input cards */}
      <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('event.exercises').toUpperCase()}</p>
      <div className="space-y-3 mb-6">
        {event.exercises.map(ex => {
          const myReps = myParticipant?.reps[ex.name] ?? 0
          const exercisePoints = myReps * ex.pointsPerRep

          return (
            <div
              key={ex.name}
              className="rounded-2xl p-4 border border-white/8"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-white/90">{ex.name}</p>
                  <p className="text-[11px] text-white/40">
                    {ex.pointsPerRep} {t('event.points')}/rep · {exercisePoints} {t('event.points')} total
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-white/90">{myReps}</p>
                  <p className="text-[10px] text-white/40">{t('event.reps')}</p>
                </div>
              </div>

              {/* Quick add buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleAdd(ex.name, 1)}
                  className="flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.95] transition-transform"
                  style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent)' }}
                >
                  <Plus size={14} /> 1
                </button>
                <button
                  onClick={() => handleAdd(ex.name, 5)}
                  className="flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.95] transition-transform border border-white/10 text-white/70 hover:bg-white/5"
                >
                  <Plus size={14} /> 5
                </button>
                <button
                  onClick={() => handleAdd(ex.name, 10)}
                  className="flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.95] transition-transform border border-white/10 text-white/70 hover:bg-white/5"
                >
                  <Plus size={14} /> 10
                </button>
                {ex.exerciseType && (
                  <button
                    className="h-10 w-10 rounded-xl flex items-center justify-center border border-indigo-400/20 hover:bg-indigo-400/10 transition-colors"
                    title={t('event.use_camera')}
                    onClick={() => handleAdd(ex.name, 1)}
                  >
                    <Camera size={16} className="text-indigo-400" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

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

      {/* Compact floating leaderboard for 6+ participants */}
      {sortedParticipants.length >= 6 && (
        <div
          className="fixed bottom-24 left-4 md:left-20 lg:left-52 z-30 rounded-xl p-2.5 backdrop-blur-lg"
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
    </div>
  )
}
