'use client'

import Link from 'next/link'
import { Play, Hash, Zap, Scissors, BookOpen, Star, ChevronRight } from 'lucide-react'
import type { WeeklyChallenge, UserChallengeProgress, WorkoutDoc, UserDoc } from '@/types'
import FirstTimeHint from '@/components/ui/FirstTimeHint'
import { useT } from '@/lib/context/LanguageContext'
import { ChallengeCard } from './ChallengeCard'
import { WorkoutHistory } from './WorkoutHistory'
import { formatDate, formatDuration } from '../_helpers'

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
}) {
  const t = useT()
  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black text-white">Antrenament</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-4 tab-bar">
        {['Acasă', 'Istoric'].map((t, i) => (
          <button key={i} onClick={() => onTabChange(i)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div>
          {/* Start workout CTA */}
          <div className="relative">
            <button
              onClick={onStartWorkout}
              className="w-full h-16 rounded-2xl mb-3 flex items-center justify-center gap-3 font-black text-lg text-black"
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

          {/* Count reps quick entry */}
          <button
            onClick={onCountReps}
            className="w-full h-[52px] rounded-2xl mb-4 flex items-center justify-center gap-3 font-bold text-base text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Hash size={20} className="text-white" />
            Numără repetări
          </button>

          {/* ML tools */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Link href="/workout/form-check">
              <div className="rounded-2xl p-3.5 flex items-center gap-3 border border-brand-green/25"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.05)' }}>
                <Zap size={20} className="text-brand-green flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">Analiză formă</p>
                  <p className="text-xs text-white/40">AI în timp real</p>
                </div>
              </div>
            </Link>
            <Link href="/workout/autocut">
              <div className="rounded-2xl p-3.5 flex items-center gap-3 border border-purple-500/25"
                style={{ backgroundColor: '#8B5CF60D' }}>
                <Scissors size={20} className="text-purple-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">AutoCut Rep</p>
                  <p className="text-xs text-white/40">Taie videoul auto</p>
                </div>
              </div>
            </Link>
          </div>

          {/* Programs card */}
          <Link href="/training/programs">
            <div className="rounded-2xl p-4 mb-4 border border-blue-500/20 hover:border-blue-500/40 transition-colors" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.06)' }}>
              <div className="flex items-center gap-3">
                <BookOpen size={18} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">Programe Structurate</p>
                  <p className="text-xs text-white/50 mt-0.5">Planuri de 4 săptămâni pentru progres real</p>
                </div>
                <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
              </div>
            </div>
          </Link>

          {/* Master Coach card */}
          {!profile?.isCoach && (
            <Link href="/workout/master-coach">
              <div className="rounded-2xl p-4 mb-4 border border-yellow-400/20 hover:border-yellow-400/40 transition-colors" style={{ backgroundColor: '#FFB80010' }}>
                <div className="flex items-center gap-3 mb-2">
                  <Star size={18} className="text-yellow-400 flex-shrink-0" />
                  <p className="text-sm font-bold text-white">Master Coach</p>
                  <span className="ml-auto text-xs font-bold text-yellow-400">500 🪙</span>
                </div>
                <p className="text-xs text-white/55 leading-relaxed">
                  Trimite un video și primești feedback personalizat de la un antrenor certificat.
                </p>
              </div>
            </Link>
          )}

          {/* Weekly challenge */}
          {challenge && (
            <ChallengeCard challenge={challenge} progress={challengeProgress} />
          )}

          {/* Last workout preview */}
          {history[0] && (
            <div className="rounded-2xl p-4 mt-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <p className="text-xs font-bold text-white/40 tracking-widest mb-2">ULTIMUL ANTRENAMENT</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">
                  {history[0].exercises.length} exerciții
                </span>
                <span className="text-xs text-white/40">{formatDate(history[0].createdAt)}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-xs text-white/60">⏱ {formatDuration(history[0].durationSeconds)}</span>
                <span className="text-xs text-white/60">🔁 {history[0].totalReps} rep</span>
                <span className="text-xs text-white/60">🪙 +{history[0].coinsEarned}</span>
              </div>
            </div>
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
    </div>
  )
}
