'use client'

import { useRef, useState } from 'react'
import { X, ChevronRight, Minus, Plus, Check } from 'lucide-react'
import RepCounterModal from '@/components/workout/RepCounterModal'
import type { ExerciseType } from '@/lib/ml/form-coach'
import type { WorkoutExercise } from '@/types'
import type { CatalogueEntry } from '@/lib/data/exercise-catalogue'
import { getExerciseType, norm } from '../_helpers'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'

// ── Types ─────────────────────────────────────────────────────────────────────

type QRCStep =
  | { name: 'select' }
  | { name: 'counting'; exerciseType: ExerciseType; exerciseName: string }
  | { name: 'post-set'; lastReps: number; lastExerciseName: string }

interface Props {
  catalogue: CatalogueEntry[]
  onSaveAsWorkout: (exercises: WorkoutExercise[], seconds: number) => void
  onContinueToWorkout: (exercises: WorkoutExercise[], seconds: number) => void
  onCancel: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeExercises(raw: WorkoutExercise[]): WorkoutExercise[] {
  const map = new Map<string, WorkoutExercise>()
  for (const ex of raw) {
    const existing = map.get(ex.name)
    if (existing) {
      existing.sets.push(...ex.sets)
    } else {
      map.set(ex.name, { ...ex, sets: [...ex.sets] })
    }
  }
  return Array.from(map.values())
}

const QUICK_EXERCISES: { type: ExerciseType; name: string; emoji: string; description: string }[] = [
  { type: 'pushup',  name: 'Flotări',    emoji: '💪', description: 'Împingeri cu greutatea corpului' },
  { type: 'pullup',  name: 'Tracțiuni',  emoji: '🏋️', description: 'Trageri la bară' },
  { type: 'squat',   name: 'Squaturi',   emoji: '🦵', description: 'Genuflexiuni' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function QuickRepCounterView({ catalogue, onSaveAsWorkout, onContinueToWorkout, onCancel }: Props) {
  const startTimeRef = useRef(Date.now())
  const [step, setStep] = useState<QRCStep>({ name: 'select' })
  const [accumulatedSets, setAccumulatedSets] = useState<WorkoutExercise[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Manual rep entry for non-camera exercises
  const [manualExercise, setManualExercise] = useState<{ name: string; category: string } | null>(null)
  const [manualReps, setManualReps] = useState(10)
  const manualPanelRef = useRef<HTMLDivElement>(null)
  const postSetPanelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(manualPanelRef, !!manualExercise)
  useFocusTrap(postSetPanelRef, step.name === 'post-set')

  const filteredCatalogue = searchQuery.trim()
    ? catalogue.filter(e => norm(e.name).includes(norm(searchQuery)))
    : []

  function handleSelectExercise(name: string, category: string, exerciseType: ExerciseType | null) {
    setSearchQuery('')
    if (exerciseType) {
      setStep({ name: 'counting', exerciseType, exerciseName: name })
    } else {
      setManualExercise({ name, category })
      setManualReps(10)
    }
  }

  function handleCountConfirm(reps: number, durationSeconds: number) {
    if (step.name !== 'counting') return
    const newEntry: WorkoutExercise = {
      name: step.exerciseName,
      category: catalogue.find(e => norm(e.name) === norm(step.exerciseName))?.category ?? 'General',
      sets: [{ reps, ...(durationSeconds > 0 && { durationSeconds }) }],
    }
    setAccumulatedSets(prev => [...prev, newEntry])
    setStep({ name: 'post-set', lastReps: reps, lastExerciseName: step.exerciseName })
  }

  function handleManualConfirm() {
    if (!manualExercise) return
    const newEntry: WorkoutExercise = {
      name: manualExercise.name,
      category: manualExercise.category,
      sets: [{ reps: manualReps }],
    }
    setAccumulatedSets(prev => [...prev, newEntry])
    setManualExercise(null)
    setStep({ name: 'post-set', lastReps: manualReps, lastExerciseName: manualExercise.name })
  }

  function handleSave() {
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
    onSaveAsWorkout(mergeExercises(accumulatedSets), elapsed)
  }

  function handleContinue() {
    setStep({ name: 'select' })
  }

  // ── Counting screen — full-screen modal ──────────────────────────────────────
  if (step.name === 'counting') {
    return (
      <RepCounterModal
        exerciseType={step.exerciseType}
        exerciseName={step.exerciseName}
        onConfirm={handleCountConfirm}
        onCancel={() => setStep({ name: 'select' })}
      />
    )
  }

  // ── Main screen (select + post-set overlay) ──────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-6 pb-4 flex-shrink-0">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--app-surface)' }}
        >
          <X size={18} className="text-white/70" />
        </button>
        <h1 className="font-black text-white text-xl flex-1">Numără repetări</h1>
      </div>

      {/* Accumulated sets summary strip */}
      {accumulatedSets.length > 0 && (
        <div className="mx-4 mb-3 rounded-2xl px-4 py-3 flex-shrink-0" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">SETURI ÎNREGISTRATE</p>
          <div className="flex flex-col gap-1">
            {mergeExercises(accumulatedSets).map((ex, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{ex.name}</span>
                <span className="text-sm text-white/50">
                  {ex.sets.length} {ex.sets.length === 1 ? 'set' : 'seturi'} · {ex.sets.reduce((s, st) => s + (st.reps ?? 0), 0)} rep
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">

        {/* Quick exercise cards */}
        <p className="text-xs font-bold text-white/40 tracking-widest mb-3">EXERCIȚII CU CAMERĂ</p>
        <div className="flex flex-col gap-2 mb-5">
          {QUICK_EXERCISES.map(ex => (
            <button
              key={ex.type}
              onClick={() => handleSelectExercise(ex.name, 'General', ex.type)}
              className="w-full rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
              style={{ backgroundColor: 'var(--app-surface)' }}
            >
              <span className="text-3xl">{ex.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-base">{ex.name}</p>
                <p className="text-xs text-white/45 mt-0.5">{ex.description}</p>
              </div>
              <ChevronRight size={18} className="text-white/25 flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Catalogue search */}
        <p className="text-xs font-bold text-white/40 tracking-widest mb-3">ALTE EXERCIȚII</p>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Caută exercițiu..."
          className="w-full h-11 rounded-xl px-4 text-sm text-white placeholder-white/30 mb-3 outline-none"
          style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        {filteredCatalogue.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
            {filteredCatalogue.slice(0, 8).map((entry, i) => (
              <button
                key={entry.name}
                onClick={() => handleSelectExercise(entry.name, entry.category, getExerciseType(entry.name))}
                className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 text-left"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
              >
                <div>
                  <span className="text-sm font-semibold text-white">{entry.name}</span>
                  {getExerciseType(entry.name) && (
                    <span className="ml-2 text-[10px] font-bold text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded-full">Cameră</span>
                  )}
                </div>
                <span className="text-xs text-white/35">{entry.category}</span>
              </button>
            ))}
          </div>
        )}
        {searchQuery.trim() && filteredCatalogue.length === 0 && (
          <p className="text-sm text-white/40 text-center py-4">Niciun exercițiu găsit</p>
        )}
      </div>

      {/* Manual rep entry bottom sheet */}
      {manualExercise && (
        <div className="fixed inset-0 z-[55] flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div ref={manualPanelRef} className="rounded-t-3xl px-5 pt-5 pb-10" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center justify-between mb-5">
              <p className="font-black text-white text-base">{manualExercise.name}</p>
              <button onClick={() => setManualExercise(null)}>
                <X size={20} className="text-white/50" />
              </button>
            </div>
            <p className="text-xs text-white/40 mb-4 text-center">Câte repetări ai făcut?</p>
            <div className="flex items-center justify-center gap-8 mb-6">
              <button
                onClick={() => setManualReps(r => Math.max(1, r - 1))}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Minus size={20} className="text-white" />
              </button>
              <span className="text-5xl font-black text-white tabular-nums w-20 text-center">{manualReps}</span>
              <button
                onClick={() => setManualReps(r => r + 1)}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Plus size={20} className="text-white" />
              </button>
            </div>
            <button
              onClick={handleManualConfirm}
              className="w-full h-14 rounded-2xl bg-brand-green text-black font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            >
              <Check size={20} />
              Confirmă {manualReps} repetăr{manualReps === 1 ? 'e' : 'i'}
            </button>
          </div>
        </div>
      )}

      {/* Post-set bottom sheet */}
      {step.name === 'post-set' && (
        <div className="fixed inset-0 z-[55] flex flex-col justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div ref={postSetPanelRef} className="rounded-t-3xl px-5 pt-5 pb-10" style={{ backgroundColor: 'var(--app-surface)' }}>
            {/* Summary */}
            <div className="mb-5">
              <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">REZUMAT</p>
              {mergeExercises(accumulatedSets).map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-semibold text-white">{ex.name}</span>
                  <span className="text-sm text-white/50">
                    {ex.sets.length} {ex.sets.length === 1 ? 'set' : 'seturi'} · {ex.sets.reduce((s, st) => s + (st.reps ?? 0), 0)} rep
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSave}
                className="w-full h-14 rounded-2xl bg-brand-green text-black font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                Salvează ca antrenament
              </button>
              <button
                onClick={() => {
                  const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
                  onContinueToWorkout(mergeExercises(accumulatedSets), elapsed)
                }}
                className="w-full h-14 rounded-2xl font-bold text-base text-white flex items-center justify-center active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Mergi la antrenament complet
              </button>
              <button
                onClick={handleContinue}
                className="w-full h-14 rounded-2xl font-bold text-base text-white flex items-center justify-center active:scale-[0.97] transition-transform"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                Continuă numărând
              </button>
              <button
                onClick={onCancel}
                className="w-full py-3 text-sm font-semibold text-red-400 active:opacity-70 transition-opacity"
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
