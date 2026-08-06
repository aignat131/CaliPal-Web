'use client'

import { X } from 'lucide-react'
import { HOLD_EXERCISES } from '@/lib/ml/hold-detector'
import type { HoldExerciseType } from '@/lib/ml/hold-detector'

const EXERCISE_ORDER: HoldExerciseType[] = ['dead_hang', 'l_sit', 'handstand', 'front_lever', 'planche']

const DIFFICULTY: Record<HoldExerciseType, { label: string; color: string }> = {
  dead_hang:   { label: 'Ușor',      color: '#1ED75F' },
  l_sit:       { label: 'Mediu',     color: '#F59E0B' },
  handstand:   { label: 'Avansat',   color: '#F97316' },
  front_lever: { label: 'Avansat',   color: '#F97316' },
  planche:     { label: 'Elite',     color: '#EF4444' },
}

interface Props {
  onSelect: (exercise: HoldExerciseType, name: string) => void
  onClose: () => void
}

export default function HoldExercisePicker({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl pt-6 px-4 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: '#111113', border: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 px-1">
          <h2 className="text-lg font-black text-white">Exerciții statice</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={14} className="text-white/60" />
          </button>
        </div>

        {/* Exercise cards */}
        <div className="flex flex-col gap-2.5">
          {EXERCISE_ORDER.map(type => {
            const meta = HOLD_EXERCISES[type]
            const diff = DIFFICULTY[type]
            return (
              <button
                key={type}
                onClick={() => onSelect(type, meta.name)}
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
