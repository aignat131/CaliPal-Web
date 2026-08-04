'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Play, Zap, BookOpen, ChevronRight, Camera, Clock, Sparkles, Swords, Trophy } from 'lucide-react'
import type { WeeklyChallenge, UserChallengeProgress, WorkoutDoc, UserDoc } from '@/types'
import type { ExerciseType } from '@/lib/ml/form-coach'
import FirstTimeHint from '@/components/ui/FirstTimeHint'
import { useT } from '@/lib/context/LanguageContext'
import { PushUpIcon, PullUpIcon, SquatIcon } from '@/components/icons'
import { ChallengeCard } from './ChallengeCard'
import { WorkoutHistory } from './WorkoutHistory'
import { formatDate, formatDuration, getExerciseType } from '../_helpers'

const EXERCISE_ICONS: Record<string, React.ComponentType<{ width?: number; height?: number; className?: string }>> = {
  'Flotări': PushUpIcon,
  'Tracțiuni': PullUpIcon,
  'Squaturi': SquatIcon,
}

const DEFAULT_QUICK_EXERCISES: { name: string; emoji: string }[] = [
  { name: 'Flotări',    emoji: '💪' },
  { name: 'Tracțiuni',  emoji: '🦾' },
  { name: 'Squaturi',   emoji: '🦵' },
]

const EXERCISE_EMOJI: Record<string, string> = {
  'flotări': '💪', 'flotari': '💪', 'push-up': '💪', 'pushup': '💪', 'diamond': '💎', 'pike': '🔺',
  'tracțiuni': '🦾', 'tractiuni': '🦾', 'chin-up': '🦾', 'chinup': '🦾', 'australian': '🦾',
  'squaturi': '🦵', 'squat': '🦵',
}

function getEmojiForExercise(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, emoji] of Object.entries(EXERCISE_EMOJI)) {
    if (lower.includes(key)) return emoji
  }
  return '🔥'
}

export function WorkoutHomeTab({
  tab,
  onTabChange,
  history,
  historyLoading,
  challenge,
  challengeProgress,
  profile,
  onStartWorkout,
  onCountReps,
  onDeleteWorkout,
  onQuickExercise,
  onAutoCount,
  onSpidermanChallenge,
  isActive,
  lastExerciseName,
  onQuickRecord,
}: {
  tab: number
  onTabChange: (t: number) => void
  history: WorkoutDoc[]
  historyLoading: boolean
  challenge: WeeklyChallenge | null
  challengeProgress: UserChallengeProgress | null
  profile: UserDoc | null
  onStartWorkout: () => void
  onCountReps: () => void
  onDeleteWorkout: (id: string) => Promise<void>
  onQuickExercise: (name: string, type: ExerciseType) => void
  onAutoCount?: () => void
  onSpidermanChallenge?: () => void
  isActive?: boolean
  lastExerciseName?: string | null
  onQuickRecord?: (name: string, type: ExerciseType) => void
}) {
  // Suppress unused lint — onCountReps kept in interface for backwards compat
  void onCountReps
  void lastExerciseName
  const t = useT()
  const [fabOpen, setFabOpen] = useState(false)
  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black text-white">Antrenament</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-4 tab-bar">
        {[t('workout.tab_home'), t('workout.tab_history')].map((label, i) => (
          <button key={i} onClick={() => onTabChange(i)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div>
          {/* Start workout CTA */}
          <div className="relative">
            <button
              onClick={onStartWorkout}
              className="w-full h-16 rounded-2xl mb-4 flex items-center justify-center gap-3 font-black text-lg text-black"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Play size={22} className="text-black fill-black" />
              Începe antrenamentul
            </button>
            {history.length === 0 && (
              <FirstTimeHint storageKey="calipal_hint_first_workout">
                {t('hint.first_workout')}
              </FirstTimeHint>
            )}
          </div>

          {/* Quick exercises — single row */}
          {(() => {
            const favorites = profile?.favoriteExercises ?? []
            const cameraFavorites = favorites
              .filter(name => getExerciseType(name) !== null)
              .map(name => ({ name, emoji: getEmojiForExercise(name) }))
            const quickExercises = cameraFavorites.length > 0
              ? cameraFavorites.slice(0, 4)
              : DEFAULT_QUICK_EXERCISES

            return (
              <div className="mb-5">
                <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2.5">EXERCIȚII RAPIDE</p>
                <div className="flex gap-2">
                  {quickExercises.map(ex => {
                    const exType = getExerciseType(ex.name)
                    if (!exType) return null
                    const IconComponent = EXERCISE_ICONS[ex.name]
                    return (
                      <button
                        key={ex.name}
                        onClick={() => onQuickExercise(ex.name, exType)}
                        className="flex-1 rounded-2xl py-3 flex flex-col items-center gap-1 active:scale-[0.97] transition-transform"
                        style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        {IconComponent
                          ? <IconComponent width={32} height={32} />
                          : <span className="text-2xl">{ex.emoji}</span>
                        }
                        <span className="font-bold text-white text-xs">{ex.name}</span>
                        <Camera size={12} className="text-brand-green" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Auto-detect counter */}
          {onAutoCount && (
            <button
              onClick={onAutoCount}
              className="w-full rounded-2xl p-4 mb-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(30,215,95,0.08))',
                border: '1px solid rgba(99,102,241,0.25)',
              }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}>
                <Sparkles size={20} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-sm">Numără automat</p>
                <p className="text-[11px] text-white/40 mt-0.5">Detectează exercițiul automat cu AI</p>
              </div>
              <Camera size={16} className="text-indigo-400 flex-shrink-0" />
            </button>
          )}

          {/* Battle Mode entry */}
          <Link
            href="/battle"
            className="w-full rounded-2xl p-4 mb-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.08))',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
              <Swords size={20} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-sm">{t('battle.title')}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{t('battle.create_sub')}</p>
            </div>
            <ChevronRight size={16} className="text-red-400/60 flex-shrink-0" />
          </Link>

          {/* Event Mode entry */}
          <Link
            href="/event"
            className="w-full rounded-2xl p-4 mb-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.08))',
              border: '1px solid rgba(251,191,36,0.25)',
            }}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}>
              <Trophy size={20} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-sm">{t('event.title')}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{t('event.subtitle')}</p>
            </div>
            <ChevronRight size={16} className="text-amber-400/60 flex-shrink-0" />
          </Link>

          {/* Spiderman Challenge */}
          {onSpidermanChallenge && (
            <button
              onClick={onSpidermanChallenge}
              className="w-full rounded-2xl p-4 mb-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(239,68,68,0.08))',
                border: '1px solid rgba(139,92,246,0.25)',
              }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}>
                <Image src="/icons/marvel.png" alt="Spiderman" width={28} height={28} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-sm">{t('spiderman.title')}</p>
                <p className="text-[11px] text-white/40 mt-0.5">{t('spiderman.subtitle')}</p>
              </div>
              <ChevronRight size={16} className="text-purple-400/60 flex-shrink-0" />
            </button>
          )}

          {/* Last workout + AI Analysis — side by side */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {/* Last workout preview */}
            {history[0] ? (
              <div className="rounded-2xl p-3.5 border border-white/8" style={{ backgroundColor: 'var(--app-surface)' }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Clock size={13} className="text-white/40" />
                  <p className="text-[10px] font-bold text-white/40 tracking-widest">ULTIMUL</p>
                </div>
                <p className="text-sm font-bold text-white mb-1.5">
                  {history[0].exercises.length} exerciții
                </p>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-white/50">⏱ {formatDuration(history[0].durationSeconds)}</span>
                  <span className="text-[11px] text-white/50">🔁 {history[0].totalReps} rep</span>
                </div>
                <p className="text-[10px] text-white/25 mt-2">{formatDate(history[0].createdAt)}</p>
              </div>
            ) : (
              <div className="rounded-2xl p-3.5 border border-white/8" style={{ backgroundColor: 'var(--app-surface)' }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Clock size={13} className="text-white/40" />
                  <p className="text-[10px] font-bold text-white/40 tracking-widest">ULTIMUL</p>
                </div>
                <p className="text-xs text-white/30 mt-2">Niciun antrenament încă</p>
              </div>
            )}

            {/* Form Analysis card */}
            <Link href="/workout/form-check">
              <div className="rounded-2xl p-3.5 h-full flex flex-col border border-brand-green/20 hover:border-brand-green/40 transition-colors"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.05)' }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Zap size={13} className="text-brand-green" />
                  <p className="text-[10px] font-bold text-brand-green/70 tracking-widest">ANALIZĂ AI</p>
                </div>
                <p className="text-sm font-bold text-white mb-1">Analiză formă</p>
                <p className="text-[11px] text-white/40 mt-auto">AI în timp real</p>
              </div>
            </Link>
          </div>

          {/* Programs card — compact */}
          <Link href="/training/programs">
            <div className="rounded-2xl p-3.5 mb-4 border border-blue-500/15 hover:border-blue-500/30 transition-colors" style={{ backgroundColor: 'rgba(59,130,246,0.04)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={16} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">Programe Structurate</p>
                  <p className="text-[11px] text-white/40 mt-0.5">Planuri de 4 săptămâni</p>
                </div>
                <ChevronRight size={16} className="text-white/20 flex-shrink-0" />
              </div>
            </div>
          </Link>

          {/* Weekly challenge */}
          {challenge && (
            <ChallengeCard challenge={challenge} progress={challengeProgress} />
          )}
        </div>
      )}

      {tab === 1 && (
        <WorkoutHistory
          history={history}
          loading={historyLoading}
          onDelete={onDeleteWorkout}
        />
      )}

      {/* Floating record FAB when workout is active */}
      {isActive && onQuickRecord && (
        <>
          {/* Backdrop when FAB is open */}
          {fabOpen && (
            <div className="fixed inset-0 z-29" onClick={() => setFabOpen(false)} />
          )}
          <div className="fixed right-4 z-30 flex flex-col items-center gap-2"
            style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
            {/* Expandable exercise options */}
            {fabOpen && (
              <div className="flex flex-col gap-2 animate-fade-in-up">
                {DEFAULT_QUICK_EXERCISES.map(ex => {
                  const exType = getExerciseType(ex.name)
                  if (!exType) return null
                  return (
                    <button
                      key={ex.name}
                      onClick={() => { setFabOpen(false); onQuickRecord(ex.name, exType) }}
                      className="flex items-center gap-2 px-3 py-2 rounded-full shadow-lg active:scale-95 transition-transform whitespace-nowrap"
                      style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.12)' }}
                    >
                      <span className="text-sm">{ex.emoji}</span>
                      <span className="text-xs font-bold text-white">{ex.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <button
              onClick={() => setFabOpen(o => !o)}
              className="w-14 h-14 rounded-full bg-red-500 shadow-lg shadow-red-500/30 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Camera size={24} className="text-white" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
