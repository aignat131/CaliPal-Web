'use client'

import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { computeExerciseStats, type ExerciseStats } from '@/lib/stats/exerciseStats'
import { useT } from '@/lib/context/LanguageContext'
import type { WorkoutDoc } from '@/types'
import { Dumbbell, Trophy, Pin, ChevronDown } from 'lucide-react'
import Link from 'next/link'

interface Props {
  uid: string
  pinnedExercises?: string[]
  onTogglePin?: (name: string) => void
}

export function ExerciseStatsTab({ uid, pinnedExercises = [], onTogglePin }: Props) {
  const t = useT()
  const [stats, setStats] = useState<ExerciseStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    getDocs(query(
      collection(db, 'users', uid, 'workouts'),
      orderBy('createdAt', 'desc'),
      limit(200),
    )).then(snap => {
      const history = snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc)
      setStats(computeExerciseStats(history))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [uid])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 mt-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="app-card p-4 animate-pulse">
            <div className="h-4 w-32 rounded bg-white/8 mb-3" />
            <div className="flex gap-4 mb-3">
              <div className="h-8 w-16 rounded bg-white/6" />
              <div className="h-8 w-16 rounded bg-white/6" />
              <div className="h-8 w-16 rounded bg-white/6" />
            </div>
            <div className="h-16 w-full rounded bg-white/5" />
          </div>
        ))}
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="app-card p-6 flex flex-col items-center gap-2 text-center mt-3">
        <Dumbbell size={28} className="text-white/20" />
        <p className="text-sm text-white/40">{t('profile.stats_empty')}</p>
        <Link href="/workout" className="text-xs text-brand-green font-semibold mt-1">
          Start workout &rarr;
        </Link>
      </div>
    )
  }

  // Sort: pinned first, then by totalReps
  const sorted = [
    ...stats.filter(s => pinnedExercises.includes(s.name)),
    ...stats.filter(s => !pinnedExercises.includes(s.name)),
  ]

  const displayed = showAll ? sorted : sorted.slice(0, 3)
  const hiddenCount = sorted.length - 3

  return (
    <div className="flex flex-col gap-3 mt-3">
      {displayed.map(ex => (
        <ExerciseCard
          key={ex.name}
          stats={ex}
          pinned={pinnedExercises.includes(ex.name)}
          onTogglePin={onTogglePin ? () => onTogglePin(ex.name) : undefined}
        />
      ))}
      {sorted.length > 3 && (
        <button
          onClick={() => setShowAll(prev => !prev)}
          className="w-full h-10 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
          style={{ backgroundColor: 'var(--app-surface)', color: 'rgba(255,255,255,0.5)' }}
        >
          <ChevronDown size={14} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
          {showAll
            ? t('profile.stats_show_less')
            : `${t('profile.stats_show_all')} (+${hiddenCount})`
          }
        </button>
      )}
    </div>
  )
}

function ExerciseCard({
  stats,
  pinned,
  onTogglePin,
}: {
  stats: ExerciseStats
  pinned?: boolean
  onTogglePin?: () => void
}) {
  const t = useT()
  const maxReps = Math.max(...stats.weeklyReps.map(w => w.reps), 1)

  return (
    <div className="app-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">{stats.name}</h3>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' }}
          >
            {stats.category}
          </span>
          {onTogglePin && (
            <button
              onClick={onTogglePin}
              className="w-6 h-6 flex items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: pinned ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent' }}
            >
              <Pin
                size={12}
                style={{ color: pinned ? 'var(--accent)' : 'rgba(255,255,255,0.25)' }}
                fill={pinned ? 'var(--accent)' : 'none'}
              />
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 rounded-xl p-2 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <p className="text-base font-black text-white">{stats.totalReps.toLocaleString()}</p>
          <p className="text-[9px] text-white/40 mt-0.5">{t('profile.stats_total_reps')}</p>
        </div>
        <div className="flex-1 rounded-xl p-2 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <p className="text-base font-black text-white">{stats.totalSets}</p>
          <p className="text-[9px] text-white/40 mt-0.5">{t('profile.stats_total_sets')}</p>
        </div>
        <div className="flex-1 rounded-xl p-2 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <p className="text-base font-black text-white">{stats.totalWorkouts}</p>
          <p className="text-[9px] text-white/40 mt-0.5">{t('profile.stats_workouts')}</p>
        </div>
      </div>

      {/* PR badge */}
      {stats.prReps > 0 && (
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-3"
          style={{ backgroundColor: '#FFB80015' }}
        >
          <Trophy size={13} className="text-[#FFB800] flex-shrink-0" />
          <span className="text-xs font-bold text-[#FFB800]">
            {t('profile.stats_pr')}: {stats.prReps} rep
          </span>
          {stats.prDate && (
            <span className="text-[10px] text-white/30 ml-auto">
              {stats.prDate.toLocaleDateString('ro', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
      )}

      {/* Weekly bar chart */}
      <div>
        <p className="text-[10px] text-white/30 mb-1.5">{t('profile.stats_trend')}</p>
        <div className="flex items-end gap-1 h-14">
          {stats.weeklyReps.map((week, i) => (
            <div key={week.weekId} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: week.reps > 0 ? `${Math.max((week.reps / maxReps) * 100, 6)}%` : '0%',
                  backgroundColor: i === stats.weeklyReps.length - 1
                    ? 'var(--accent)'
                    : 'rgba(var(--accent-rgb), 0.25)',
                }}
              />
              <span className="text-[7px] text-white/25">{week.weekLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
