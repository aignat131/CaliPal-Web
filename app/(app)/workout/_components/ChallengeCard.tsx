'use client'

import { Trophy } from 'lucide-react'
import type { WeeklyChallenge, UserChallengeProgress } from '@/types'

export function ChallengeCard({
  challenge, progress,
}: {
  challenge: WeeklyChallenge
  progress: UserChallengeProgress | null
}) {
  const current = progress?.currentReps ?? 0
  const pct = Math.min(100, Math.round((current / challenge.targetReps) * 100))
  const done = progress?.completed ?? false

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-yellow-400" />
          <p className="text-xs font-bold text-white/50 tracking-widest">PROVOCARE SĂPTĂMÂNALĂ</p>
        </div>
        {done && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/20 text-brand-green">FINALIZAT ✓</span>}
      </div>
      <p className="font-black text-white text-base mb-0.5">{challenge.title}</p>
      <p className="text-xs text-white/50 mb-3">{challenge.description}</p>
      <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
        <span>{current} / {challenge.targetReps} {challenge.exerciseName}</span>
        <span>🪙 +{challenge.coinsReward}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: done ? 'var(--accent)' : 'rgba(var(--accent-rgb), 0.55)' }}
        />
      </div>
    </div>
  )
}
