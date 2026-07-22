'use client'

import { useState } from 'react'
import { Info, Lightbulb, ChevronDown } from 'lucide-react'
import ExerciseAnimation from './ExerciseAnimation'
import DifficultyBadge from './DifficultyBadge'
import MusclePills from './MusclePills'
import { getExerciseMetadata, inferDifficulty } from '@/lib/data/exercise-metadata'

interface Props {
  /** 1-based index for the numbered circle */
  index: number
  name: string
  /** Category from the exercise catalogue (e.g. "Trageri", "Împingeri") */
  category?: string
  sets: number
  repsPerSet: number
  metric?: 'reps' | 'seconds'
  /** Program/training notes for this exercise */
  notes?: string
}

export default function ExerciseCard({ index, name, category = 'Altele', sets, repsPerSet, metric = 'reps', notes }: Props) {
  const [expanded, setExpanded] = useState(false)
  const meta = getExerciseMetadata(name)
  const difficulty = meta?.difficulty ?? inferDifficulty(category)
  const hasExpandableContent = !!(meta?.description || meta?.tip || notes)

  return (
    <div
      className="rounded-xl border border-white/8 transition-all"
      style={{ backgroundColor: 'var(--app-surface)' }}
    >
      {/* Main row — always visible */}
      <button
        onClick={() => hasExpandableContent && setExpanded(e => !e)}
        className="w-full p-3.5 text-left"
        disabled={!hasExpandableContent}
      >
        <div className="flex items-start gap-2.5">
          {/* Index circle */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', color: 'var(--accent)' }}
          >
            {index}
          </div>

          {/* Animation thumbnail */}
          {meta?.animationId && (
            <div className="flex-shrink-0 rounded-lg bg-white/5 p-1 flex items-center justify-center" style={{ width: 42, height: 42 }}>
              <ExerciseAnimation id={meta.animationId} size={36} />
            </div>
          )}

          {/* Name + sets info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{name}</p>
            <p className="text-xs text-white/45 mt-0.5">
              {sets} x {repsPerSet} {metric === 'seconds' ? 'sec' : 'rep'}
            </p>
          </div>

          {/* Right side: difficulty + expand indicator */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <DifficultyBadge difficulty={difficulty} />
            {hasExpandableContent && (
              <ChevronDown
                size={14}
                className={`text-white/25 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            )}
          </div>
        </div>

        {/* Muscle pills — always visible */}
        <div className="mt-2 pl-[38px]">
          <MusclePills exerciseName={name} category={category} />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 flex flex-col gap-2 pl-[52px]">
          {/* Description */}
          {meta?.description && (
            <p className="text-[11px] text-white/50 leading-snug">{meta.description}</p>
          )}

          {/* Program notes */}
          {notes && (
            <div className="flex items-start gap-1.5">
              <Info size={11} className="text-brand-green flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-white/45 leading-snug">{notes}</p>
            </div>
          )}

          {/* Form tip */}
          {meta?.tip && (
            <div className="flex items-start gap-1.5">
              <Lightbulb size={11} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-yellow-400/70 leading-snug">{meta.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
