'use client'

import { useState } from 'react'
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useT } from '@/lib/context/LanguageContext'
import { X, Minus, Plus, Trash2 } from 'lucide-react'
import { generateUniqueEventCode } from '@/lib/event/room-codes'
import { getExerciseType } from '@/app/(app)/workout/_helpers'
import {
  DEFAULT_EXERCISES, DEFAULT_MAX_PARTICIPANTS, MAX_PARTICIPANTS_LIMIT,
  MIN_PARTICIPANTS, DURATION_OPTIONS,
} from '@/lib/event/types'
import type { EventExerciseConfig } from '@/lib/event/types'
import type { BotDifficulty } from '@/lib/bots/bot-behavior'
import { addBotsToEvent } from '@/lib/bots/useEventBots'

interface Props {
  onClose: () => void
  onCreated: (eventId: string) => void
}

// Only exercises with camera support (pushup/pullup/squat detection)
const EXERCISE_CATALOG = [
  'Flotări', 'Tracțiuni', 'Squaturi',
  'Diamond Push-ups', 'Pike Push-ups', 'Chin-ups', 'Australian Pull-ups',
]

export default function CreateEventSheet({ onClose, onCreated }: Props) {
  const { user } = useAuth()
  const { displayName, photoUrl, profileLoaded } = useMyProfile()
  const t = useT()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [exercises, setExercises] = useState<EventExerciseConfig[]>([...DEFAULT_EXERCISES])
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState<number | null>(20)
  const [customDuration, setCustomDuration] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState(DEFAULT_MAX_PARTICIPANTS)
  const [isPublic, setIsPublic] = useState(false)
  const [addBots, setAddBots] = useState(false)
  const [botCount, setBotCount] = useState(1)
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('MEDIUM')
  const [creating, setCreating] = useState(false)
  const [showAddExercise, setShowAddExercise] = useState(false)

  function addExercise(exerciseName: string) {
    if (exercises.some(e => e.name === exerciseName)) return
    const exType = getExerciseType(exerciseName)
    setExercises(prev => [...prev, {
      name: exerciseName,
      exerciseType: exType,
      pointsPerRep: 1,
    }])
    setShowAddExercise(false)
  }

  function removeExercise(index: number) {
    setExercises(prev => prev.filter((_, i) => i !== index))
  }

  function updatePoints(index: number, delta: number) {
    setExercises(prev => prev.map((ex, i) =>
      i === index ? { ...ex, pointsPerRep: Math.max(1, ex.pointsPerRep + delta) } : ex
    ))
  }

  async function handleCreate() {
    if (!user || !name.trim() || exercises.length === 0 || creating || !profileLoaded) return
    setCreating(true)
    try {
      const code = await generateUniqueEventCode()
      const now = Timestamp.now()
      const expiresAt = new Timestamp(now.seconds + 86400, now.nanoseconds) // 24h

      const ref = await addDoc(collection(db, 'events'), {
        code,
        hostUid: user.uid,
        hostName: displayName,
        hostPhotoUrl: photoUrl,
        name: name.trim(),
        description: description.trim(),
        exercises,
        scheduledAt: scheduledAt ? Timestamp.fromDate(new Date(scheduledAt)) : null,
        durationMinutes,
        maxParticipants,
        isPublic,
        status: 'LOBBY',
        participantCount: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: serverTimestamp(),
        expiresAt,
        ...(addBots && { botCount, botDifficulty }),
      })

      // Add bots to lobby after event is created
      if (addBots && botCount > 0) {
        addBotsToEvent(ref.id, botCount).catch(() => {})
      }

      onCreated(ref.id)
    } catch {
      setCreating(false)
    }
  }

  const availableExercises = EXERCISE_CATALOG.filter(
    name => !exercises.some(e => e.name === name)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl p-5 animate-[slideUp_0.3s_ease-out]"
        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white/90">{t('event.create')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={20} className="text-white/50" />
          </button>
        </div>

        {/* Event name */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.name')}</label>
        <input
          type="text"
          maxLength={100}
          placeholder={t('event.name_placeholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full h-11 px-4 mb-4 rounded-xl border border-white/15 bg-white/5 text-sm text-white/90 placeholder:text-white/25 focus:border-amber-400/50 outline-none"
        />

        {/* Description */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.description')}</label>
        <textarea
          maxLength={500}
          placeholder="..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full px-4 py-2.5 mb-4 rounded-xl border border-white/15 bg-white/5 text-sm text-white/90 placeholder:text-white/25 focus:border-amber-400/50 outline-none resize-none"
        />

        {/* Public toggle */}
        <div
          className="flex items-center justify-between mb-4 p-3 rounded-xl border border-white/8"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
        >
          <div>
            <p className="text-sm font-medium text-white/80">{t('event.public_event')}</p>
            <p className="text-xs text-white/40">{t('event.public_event_desc')}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPublic(p => !p)}
            className="w-11 h-6 rounded-full transition-colors flex-shrink-0 relative"
            style={{ backgroundColor: isPublic ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }}
          >
            <div
              className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
              style={{ left: isPublic ? '22px' : '2px' }}
            />
          </button>
        </div>

        {/* Exercises with point values */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.exercises')}</label>
        <div className="space-y-2 mb-3">
          {exercises.map((ex, i) => (
            <div
              key={ex.name}
              className="flex items-center gap-2 p-2.5 rounded-xl border border-white/8"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              <span className="flex-1 text-sm font-medium text-white/85 truncate">{ex.name}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updatePoints(i, -1)}
                  className="w-6 h-6 rounded-md border border-white/10 flex items-center justify-center text-white/50 hover:bg-white/5 disabled:opacity-30"
                  disabled={ex.pointsPerRep <= 1}
                >
                  <Minus size={12} />
                </button>
                <span className="text-sm font-bold text-amber-400 w-5 text-center">{ex.pointsPerRep}</span>
                <button
                  onClick={() => updatePoints(i, 1)}
                  className="w-6 h-6 rounded-md border border-white/10 flex items-center justify-center text-white/50 hover:bg-white/5"
                >
                  <Plus size={12} />
                </button>
                <span className="text-[10px] text-white/40">{t('event.points_per_rep')}</span>
              </div>
              <button
                onClick={() => removeExercise(i)}
                className="p-1 rounded-md hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add exercise */}
        {showAddExercise ? (
          <div className="mb-4 p-3 rounded-xl border border-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="flex flex-wrap gap-1.5">
              {availableExercises.map(name => (
                <button
                  key={name}
                  onClick={() => addExercise(name)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 border border-white/10 hover:border-amber-400/30 hover:bg-amber-400/5 transition-all"
                >
                  + {name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddExercise(false)}
              className="mt-2 text-xs text-white/40 hover:text-white/60"
            >
              {t('event.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddExercise(true)}
            className="mb-4 text-sm font-medium text-amber-400/80 hover:text-amber-400 transition-colors"
          >
            + {t('event.add_exercise')}
          </button>
        )}

        {/* Schedule */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.schedule')}</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          className="w-full h-11 px-4 mb-4 rounded-xl border border-white/15 bg-white/5 text-sm text-white/90 focus:border-amber-400/50 outline-none [color-scheme:dark]"
        />

        {/* Duration */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.duration')}</label>
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => { setDurationMinutes(null); setCustomDuration(false) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              durationMinutes === null && !customDuration
                ? 'border-amber-400/50 text-white/90'
                : 'border-white/8 text-white/50 hover:border-white/15'
            }`}
            style={durationMinutes === null && !customDuration ? { backgroundColor: 'rgba(251,191,36,0.1)' } : {}}
          >
            {t('event.no_limit')}
          </button>
          {DURATION_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => { setDurationMinutes(d); setCustomDuration(false) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                durationMinutes === d && !customDuration
                  ? 'border-amber-400/50 text-white/90'
                  : 'border-white/8 text-white/50 hover:border-white/15'
              }`}
              style={durationMinutes === d && !customDuration ? { backgroundColor: 'rgba(251,191,36,0.1)' } : {}}
            >
              {d} {t('event.minutes')}
            </button>
          ))}
          <button
            onClick={() => {
              setCustomDuration(true)
              if (!durationMinutes || DURATION_OPTIONS.includes(durationMinutes as typeof DURATION_OPTIONS[number])) {
                setDurationMinutes(25)
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              customDuration
                ? 'border-amber-400/50 text-white/90'
                : 'border-white/8 text-white/50 hover:border-white/15'
            }`}
            style={customDuration ? { backgroundColor: 'rgba(251,191,36,0.1)' } : {}}
          >
            {t('event.custom')}
          </button>
        </div>
        {customDuration && (
          <div className="flex items-center gap-3 mb-4">
            <input
              type="number"
              min={1}
              max={180}
              value={durationMinutes ?? ''}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                setDurationMinutes(isNaN(v) ? null : Math.min(180, Math.max(1, v)))
              }}
              className="w-20 h-10 px-3 rounded-xl border border-white/15 bg-white/5 text-sm text-white/90 text-center focus:border-amber-400/50 outline-none"
            />
            <span className="text-sm text-white/50">{t('event.minutes')}</span>
          </div>
        )}

        {/* Max participants */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.max_participants')}</label>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setMaxParticipants(p => Math.max(MIN_PARTICIPANTS, p - 1))}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
            disabled={maxParticipants <= MIN_PARTICIPANTS}
          >
            <Minus size={16} />
          </button>
          <span className="text-lg font-bold text-white/90 w-8 text-center">{maxParticipants}</span>
          <button
            onClick={() => setMaxParticipants(p => Math.min(MAX_PARTICIPANTS_LIMIT, p + 1))}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
            disabled={maxParticipants >= MAX_PARTICIPANTS_LIMIT}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Add Bots */}
        <div className="mb-4">
          <button
            onClick={() => setAddBots(v => !v)}
            className={`w-full p-3 rounded-xl text-sm font-medium flex items-center justify-between transition-all border ${
              addBots ? 'border-amber-400/50 text-white/90' : 'border-white/8 text-white/50 hover:border-white/15'
            }`}
            style={addBots ? { backgroundColor: 'rgba(251,191,36,0.1)' } : { backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <span className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              {t('bot.add')}
            </span>
            <div className={`w-9 h-5 rounded-full transition-colors flex items-center ${addBots ? 'bg-amber-400 justify-end' : 'bg-white/15 justify-start'}`}>
              <div className="w-4 h-4 rounded-full bg-white mx-0.5" />
            </div>
          </button>

          {addBots && (
            <div className="mt-3 pl-1">
              {/* Bot count */}
              <label className="block text-sm font-medium text-white/60 mb-2">{t('bot.count')}</label>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setBotCount(c => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
                  disabled={botCount <= 1}
                >
                  <Minus size={16} />
                </button>
                <span className="text-lg font-bold text-white/90 w-8 text-center">{botCount}</span>
                <button
                  onClick={() => setBotCount(c => Math.min(maxParticipants - 1, c + 1))}
                  className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
                  disabled={botCount >= maxParticipants - 1}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Bot difficulty */}
              <label className="block text-sm font-medium text-white/60 mb-2">{t('bot.difficulty')}</label>
              <div className="flex gap-1.5">
                {(['EASY', 'MEDIUM', 'HARD'] as BotDifficulty[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setBotDifficulty(d)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      botDifficulty === d
                        ? 'border-amber-400/50 text-white/90'
                        : 'border-white/8 text-white/50 hover:border-white/15'
                    }`}
                    style={botDifficulty === d ? { backgroundColor: 'rgba(251,191,36,0.1)' } : {}}
                  >
                    {t(`bot.${d.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || exercises.length === 0 || creating || !profileLoaded}
          className="w-full h-11 rounded-xl font-semibold text-black transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {creating ? (
            <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : t('event.create_btn')}
        </button>
      </div>
    </div>
  )
}
