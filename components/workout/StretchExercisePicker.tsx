'use client'

import { X, Clock, ChevronRight } from 'lucide-react'
import { STRETCH_EXERCISES } from '@/lib/ml/stretch-detector'
import type { StretchExerciseType } from '@/lib/ml/stretch-detector'
import { STRETCH_ROUTINES } from '@/lib/data/stretch-routines'
import type { StretchRoutine } from '@/lib/data/stretch-routines'

const EXERCISE_ORDER: StretchExerciseType[] = [
  'forward_fold', 'pike_stretch', 'bridge', 'pigeon_pose',
  'pancake_stretch', 'front_split', 'side_split',
]

const DIFFICULTY_LABEL: Record<string, { label: string; color: string }> = {
  beginner:     { label: 'Ușor',    color: '#1ED75F' },
  intermediate: { label: 'Mediu',   color: '#F59E0B' },
  advanced:     { label: 'Avansat', color: '#F97316' },
}

interface Props {
  onSelectExercise: (exercise: StretchExerciseType, name: string) => void
  onSelectRoutine: (routine: StretchRoutine) => void
  onClose: () => void
}

export default function StretchExercisePicker({ onSelectExercise, onSelectRoutine, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl pb-8 pt-6 px-4 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: '#111113', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 px-1">
          <h2 className="text-lg font-black text-white">Stretching</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={14} className="text-white/60" />
          </button>
        </div>

        {/* ── Routines Section ─────────────────────────────────── */}
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2.5 px-1">
          Rutine
        </p>
        <div className="flex flex-col gap-2.5 mb-6">
          {STRETCH_ROUTINES.map(routine => {
            const diff = DIFFICULTY_LABEL[routine.difficulty]
            return (
              <button
                key={routine.id}
                onClick={() => onSelectRoutine(routine)}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left active:scale-[0.98] transition-transform"
                style={{
                  background: 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(168,85,247,0.04))',
                  border: '1px solid rgba(236,72,153,0.2)',
                }}
              >
                <span className="text-2xl w-10 text-center flex-shrink-0">{routine.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{routine.nameRO}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-white/40 flex items-center gap-0.5">
                      <Clock size={10} /> {routine.estimatedMinutes} min
                    </span>
                    <span className="text-xs text-white/30">·</span>
                    <span className="text-xs text-white/40">
                      {routine.steps.length} exerciții
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${diff.color}20`, color: diff.color }}
                  >
                    {diff.label}
                  </span>
                  <ChevronRight size={14} className="text-white/20" />
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Individual Exercises Section ──────────────────────── */}
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2.5 px-1">
          Exerciții individuale
        </p>
        <div className="flex flex-col gap-2.5">
          {EXERCISE_ORDER.map(type => {
            const meta = STRETCH_EXERCISES[type]
            const diff = DIFFICULTY_LABEL[meta.difficulty]
            return (
              <button
                key={type}
                onClick={() => onSelectExercise(type, meta.name)}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left active:scale-[0.98] transition-transform"
                style={{
                  background: `linear-gradient(135deg, ${meta.color}12, ${meta.color}06)`,
                  border: `1px solid ${meta.color}30`,
                }}
              >
                <span className="text-2xl w-10 text-center flex-shrink-0">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{meta.name}</p>
                  <p className="text-xs text-white/50 mt-0.5">{meta.description}</p>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `${diff.color}20`, color: diff.color }}
                >
                  {diff.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
