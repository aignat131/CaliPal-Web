'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronRight, Check, X, Play, Square, Search, Camera } from 'lucide-react'
import type { WorkoutExercise, WorkoutSet } from '@/types'
import { DEFAULT_EXERCISE_CATALOGUE, getMetric, getCategory, groupByCategoryByCatalogue, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import RepCounterModal from '@/components/workout/RepCounterModal'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { formatDuration, totalRepsInWorkout, norm, getExerciseType } from '../_helpers'

export function ActiveWorkoutView({
  exercises, seconds, note, catalogue, onNoteChange,
  onReplaceExerciseSets, onAddExercise, onRemoveExercise, onFinish, onCancel,
  favorites, onToggleFavorite: _onToggleFavorite,
}: {
  exercises: WorkoutExercise[]
  seconds: number
  note: string
  catalogue: CatalogueEntry[]
  onNoteChange: (v: string) => void
  onReplaceExerciseSets: (ei: number, sets: WorkoutSet[]) => void
  onAddExercise: (name: string, set: WorkoutSet) => void
  onRemoveExercise: (idx: number) => void
  onFinish: (doneKeys: Set<string>) => void
  onCancel: () => void
  favorites: string[]
  onToggleFavorite: (name: string) => void
}) {
  const [showCancel, setShowCancel] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)

  // Per-set completion tracking (local only, resets when workout ends)
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())

  function toggleSet(ei: number, si: number) {
    const key = `${ei}-${si}`
    setDoneKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Edit existing exercise sets popup
  const [popupExIdx, setPopupExIdx] = useState<number | null>(null)
  const [popupSets, setPopupSets] = useState<WorkoutSet[]>([])
  const [popupModifier, setPopupModifier] = useState<'none' | 'weight' | 'band'>('none')

  // Search sheet
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Close search sheet on Android/browser back press
  useEffect(() => {
    if (!showSearch) return
    window.history.pushState({ modal: 'exercise-search' }, '')
    const handlePop = () => { setShowSearch(false); setSearchQuery('') }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [showSearch])

  // Log new exercise popup
  const [logExercise, setLogExercise] = useState<string | null>(null)
  const [logReps, setLogReps] = useState(10)
  const [logSecs, setLogSecs] = useState(30)
  const [logWeightOn, setLogWeightOn] = useState(false)
  const [logWeight, setLogWeight] = useState(10)
  const [logBandOn, setLogBandOn] = useState(false)
  const [logBandKg, setLogBandKg] = useState(5)
  const [showRepCounter, setShowRepCounter] = useState(false)

  const totalReps = totalRepsInWorkout(exercises)
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0)

  // Effective done keys: manual (non-program) sets are always considered done
  const effectiveDoneKeys = new Set(doneKeys)
  exercises.forEach((ex, ei) => {
    if (!ex.fromProgram) {
      ex.sets.forEach((_, si) => effectiveDoneKeys.add(`${ei}-${si}`))
    }
  })
  const doneCount = effectiveDoneKeys.size

  // Stats shown in the confirm dialog
  const programDoneAny = exercises.some((ex, ei) => ex.fromProgram && ex.sets.some((_, si) => doneKeys.has(`${ei}-${si}`)))
  const confirmedReps = programDoneAny
    ? exercises.reduce((total, ex, ei) =>
        total + ex.sets.reduce((s, set, si) =>
          effectiveDoneKeys.has(`${ei}-${si}`) ? s + (set.reps ?? 0) : s, 0), 0)
    : totalReps
  const confirmedExCount = programDoneAny
    ? exercises.filter((ex, ei) => ex.sets.some((_, si) => effectiveDoneKeys.has(`${ei}-${si}`))).length
    : exercises.length

  const debouncedQuery = useDebounce(searchQuery, 150)

  const filteredCatalogue = debouncedQuery.trim()
    ? catalogue.filter(e => norm(e.name).includes(norm(debouncedQuery)))
    : catalogue

  const grouped = groupByCategoryByCatalogue(filteredCatalogue)

  function openExPopup(ei: number, sets: WorkoutSet[]) {
    setPopupExIdx(ei)
    const copied = sets.map(s => ({ ...s }))
    setPopupSets(copied)
    const hasWeight = copied.some(s => s.weightKg != null)
    const hasBand   = copied.some(s => s.bandKg   != null)
    const category  = exercises[ei]?.category ?? ''
    setPopupModifier(hasWeight || category === 'Cu Greutate' ? 'weight' : hasBand || category === 'Cu Bandă' ? 'band' : 'none')
  }

  function savePopup() {
    if (popupExIdx !== null) {
      const cleaned = popupSets.map(s => {
        const { weightKg: _w, bandKg: _b, ...rest } = s
        if (popupModifier === 'weight') return { ...rest, weightKg: s.weightKg }
        if (popupModifier === 'band')   return { ...rest, bandKg:   s.bandKg   }
        return rest
      })
      onReplaceExerciseSets(popupExIdx, cleaned)
      setPopupExIdx(null)
    }
  }

  function openLogPopup(name: string) {
    const metric   = getMetric(name, catalogue)
    const category = getCategory(name, catalogue)
    setLogExercise(name)
    setLogReps(metric === 'reps' ? 10 : 0)
    setLogSecs(metric === 'seconds' ? 30 : 0)
    setLogWeightOn(category === 'Cu Greutate')
    setLogWeight(10)
    setLogBandOn(category === 'Cu Bandă')
    setLogBandKg(5)
  }

  function confirmLog() {
    if (!logExercise) return
    const metric = getMetric(logExercise, catalogue)
    const set: WorkoutSet = {
      ...(metric === 'reps' ? { reps: logReps } : { durationSeconds: logSecs }),
      ...(logWeightOn ? { weightKg: logWeight } : {}),
      ...(logBandOn   ? { bandKg:   logBandKg } : {}),
    }
    onAddExercise(logExercise, set)
    setLogExercise(null)
    setShowSearch(false)
    setSearchQuery('')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Timer bar */}
      <div className="flex-shrink-0 border-b border-white/8">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 pt-4 pb-3">
          <button onClick={() => setShowCancel(true)} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <Square size={14} className="text-white/60" />
          </button>
          <div className="text-center">
            <p className="text-2xl font-black text-brand-green tabular-nums">{formatDuration(seconds)}</p>
            <p className="text-xs text-white/35">{totalReps} rep</p>
            {totalSets > 0 && (
              <p className="text-[10px] font-bold mt-0.5" style={{ color: doneCount === totalSets ? '#1ED75F' : 'rgba(255,255,255,0.25)' }}>
                {doneCount}/{totalSets} serii
              </p>
            )}
          </div>
          <button
            onClick={() => setShowFinishConfirm(true)}
            disabled={exercises.length === 0}
            className="h-9 px-4 rounded-full bg-brand-green text-black text-sm font-black disabled:opacity-40"
          >
            Finalizează
          </button>
        </div>
      </div>

      {/* Exercises */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {exercises.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-white/35 mb-2">Niciun exercițiu adăugat.</p>
              <p className="text-xs text-white/25">Caută un exercițiu pentru a începe.</p>
            </div>
          )}

          {exercises.map((ex, ei) => {
            const hasWeight = ex.sets.some(s => s.weightKg != null)
            const hasBand   = ex.sets.some(s => s.bandKg   != null)
            const accentColor = hasWeight ? '#f97316' : hasBand ? '#a855f7' : null
            const isManual = !ex.fromProgram
            const allDone = ex.sets.length > 0 && ex.sets.every((_, si) => effectiveDoneKeys.has(`${ei}-${si}`))
            return (
              <div
                key={`${ex.name}-${ei}`}
                className="rounded-2xl mb-3 overflow-hidden border transition-all"
                style={{
                  backgroundColor: 'var(--app-surface)',
                  boxShadow: allDone
                    ? 'inset 3px 0 0 #1ED75F'
                    : accentColor
                    ? `inset 3px 0 0 ${accentColor}`
                    : undefined,
                  borderColor: allDone ? '#1ED75F22' : 'transparent',
                }}
              >
                {accentColor && !allDone && (
                  <div className="flex items-center gap-1.5 px-4 py-1.5"
                    style={{ backgroundColor: `${accentColor}18` }}>
                    {hasWeight && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-orange-500/35 text-orange-400 bg-orange-500/10">
                        ⚖️ cu greutate
                      </span>
                    )}
                    {hasBand && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-500/35 text-purple-400 bg-purple-500/10">
                        🔴 cu bandă
                      </span>
                    )}
                  </div>
                )}

                <div className="p-4 pt-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="flex-1 flex items-center justify-between cursor-pointer select-none min-w-0"
                      onPointerDown={() => openExPopup(ei, ex.sets)}
                    >
                      <p className={`font-bold text-sm transition-colors ${allDone ? 'text-white/50' : 'text-white'}`}>{ex.name}</p>
                      {allDone
                        ? <span className="text-[10px] font-black text-brand-green animate-fade-in-up flex items-center gap-0.5 flex-shrink-0 ml-2">
                            <Check size={10} strokeWidth={3} /> completat
                          </span>
                        : <ChevronRight size={16} className="text-white/30 flex-shrink-0 ml-2" />
                      }
                    </div>
                    <button
                      onPointerDown={() => onRemoveExercise(ei)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {ex.sets.map((s, si) => {
                      const key = `${ei}-${si}`
                      const done = isManual || doneKeys.has(key)
                      const val = s.reps != null ? `${s.reps} rep` : s.durationSeconds != null ? `${s.durationSeconds}s` : '—'
                      const mod = s.weightKg ? ` · +${s.weightKg}kg` : s.bandKg ? ` · ~${s.bandKg}kg` : ''
                      return (
                        <button
                          key={si}
                          onPointerDown={isManual ? undefined : () => toggleSet(ei, si)}
                          className={`flex items-center gap-2.5 w-full text-left rounded-xl px-2 py-1.5 transition-all select-none ${done ? 'bg-brand-green/8' : 'hover:bg-white/4'} ${!isManual ? 'active:scale-[0.97]' : 'cursor-default'}`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${done ? 'bg-brand-green animate-pop-in' : 'border border-white/20'}`}>
                            {done
                              ? <Check size={12} strokeWidth={3} className="text-black" />
                              : <span className="text-[10px] font-black text-white/30">{si + 1}</span>
                            }
                          </div>
                          <span className={`text-xs font-semibold transition-colors ${done ? 'text-white/30 line-through' : 'text-white/55'}`}>
                            {val}
                            {mod && <span style={{ color: done ? undefined : s.weightKg ? '#fb923c99' : '#c084fc99' }}>{mod}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Search exercise button */}
          <button
            onClick={() => setShowSearch(true)}
            className="w-full h-11 rounded-2xl border border-dashed border-white/20 text-sm text-white/40 flex items-center justify-center gap-2 mb-3 hover:border-brand-green/40 hover:text-brand-green transition-colors"
          >
            <Search size={15} /> Caută exercițiu
          </button>

          {/* Note */}
          <textarea
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Notițe (opțional)..."
            rows={2}
            className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/10 bg-white/5 resize-none"
          />
        </div>
      </div>

      {/* Finish confirm dialog */}
      {showFinishConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="font-bold text-white text-base mb-1">Finalizezi antrenamentul?</p>
            <p className="text-sm text-white/50 mb-5">
              {confirmedExCount} exerciți{confirmedExCount === 1 ? 'u' : 'i'} · {formatDuration(seconds)} · {confirmedReps} rep
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowFinishConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm text-white/80">Continuă</button>
              <button onClick={() => { setShowFinishConfirm(false); onFinish(effectiveDoneKeys) }}
                className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold">
                Da, finalizează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {showCancel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="font-bold text-white text-base mb-1">Abandonezi antrenamentul?</p>
            <p className="text-sm text-white/50 mb-5">Progresul nu va fi salvat.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancel(false)} className="flex-1 h-11 rounded-xl border border-white/20 text-sm text-white/80">Continuă</button>
              <button onClick={onCancel} className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-bold">Abandonează</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit existing exercise sets popup */}
      {popupExIdx !== null && (() => {
        const metric = getMetric(exercises[popupExIdx].name, catalogue)
        const BANDS = [5, 15, 25, 35, 45, 55]

        function applyModifier(m: 'none' | 'weight' | 'band') {
          if (m === 'weight') {
            setPopupSets(prev => prev.map(s => ({ ...s, weightKg: s.weightKg ?? 10 })))
          } else if (m === 'band') {
            setPopupSets(prev => prev.map(s => ({ ...s, bandKg: s.bandKg ?? 5 })))
          }
          setPopupModifier(m)
        }

        return (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-20">
            <div className="w-full max-w-lg rounded-t-3xl pb-8 max-h-[92vh] flex flex-col" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 flex-shrink-0">
                <div>
                  <p className="font-black text-white text-base">{exercises[popupExIdx].name}</p>
                  <p className="text-xs text-white/40">{exercises[popupExIdx].category} · {metric === 'reps' ? 'Repetări' : 'Secunde'}</p>
                </div>
                <button aria-label="Închide" onClick={() => setPopupExIdx(null)} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                  <X size={14} className="text-white/60" />
                </button>
              </div>

              {/* Modifier chips */}
              <div className="px-5 pt-3 pb-3 border-b border-white/6 flex-shrink-0">
                <div className="flex gap-2">
                  {(['none', 'weight', 'band'] as const).map(m => (
                    <button key={m}
                      onClick={() => applyModifier(m)}
                      className={`flex-1 h-9 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                        popupModifier === m
                          ? m === 'none' ? 'bg-white/12 border-white/25 text-white'
                            : m === 'weight' ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                            : 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                          : 'bg-white/4 border-white/10 text-white/35'
                      }`}
                    >
                      {m === 'none' ? 'Normal' : m === 'weight' ? '⚖️ Greutate' : '🔴 Bandă'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sets list */}
              <div className="flex-1 overflow-y-auto px-5 pt-2">
                <div className="flex items-center gap-2 py-2">
                  <span className="w-8 text-[10px] font-bold text-white/25 text-center">SET</span>
                  <span className="flex-1 text-[10px] font-bold text-white/25 text-center">
                    {metric === 'reps' ? 'REPETĂRI' : 'SECUNDE'}
                  </span>
                  {popupModifier !== 'none' && (
                    <span className="w-28 text-[10px] font-bold text-white/25 text-center">
                      {popupModifier === 'weight' ? 'GREUTATE' : 'BANDĂ'}
                    </span>
                  )}
                  <span className="w-6 flex-shrink-0" />
                </div>

                {popupSets.map((set, si) => {
                  const reps = set.reps ?? 0
                  const secs = set.durationSeconds ?? 0
                  const wKg  = set.weightKg ?? 10
                  const bKg  = set.bandKg   ?? 5
                  return (
                    <div key={si} className="flex items-center gap-2 py-2.5 border-b border-white/6">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#1ED75F22', border: '1.5px solid #1ED75F55' }}>
                        <span className="text-xs font-black text-brand-green">{si + 1}</span>
                      </div>

                      {metric === 'reps' && (
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: Math.max(1, (s.reps ?? 0) - 1) } : s))}
                            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:bg-white/12 active:scale-95 transition-all text-lg font-bold">−</button>
                          <input
                            type="number" inputMode="numeric" value={reps}
                            onChange={e => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: Math.max(1, parseInt(e.target.value) || 1) } : s))}
                            onFocus={e => e.target.select()}
                            className="w-10 text-center text-xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            min={1}
                          />
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, reps: (s.reps ?? 0) + 1 } : s))}
                            className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center text-black hover:opacity-90 active:scale-95 transition-all text-lg font-bold">+</button>
                        </div>
                      )}
                      {metric === 'seconds' && (
                        <div className="flex-1 flex items-center justify-center gap-2">
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: Math.max(1, (s.durationSeconds ?? 0) - 5) } : s))}
                            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:bg-white/12 active:scale-95 transition-all text-lg font-bold">−</button>
                          <div className="flex items-baseline justify-center w-12">
                            <input
                              type="number" inputMode="numeric" value={secs}
                              onChange={e => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: Math.max(1, parseInt(e.target.value) || 1) } : s))}
                              onFocus={e => e.target.select()}
                              className="w-9 text-center text-xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              min={1}
                            />
                            <span className="text-sm text-white/40">s</span>
                          </div>
                          <button onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, durationSeconds: (s.durationSeconds ?? 0) + 5 } : s))}
                            className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center text-black hover:opacity-90 active:scale-95 transition-all text-lg font-bold">+</button>
                        </div>
                      )}

                      {popupModifier === 'weight' && (
                        <div className="w-28 flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, weightKg: Math.max(0, +((s.weightKg ?? 10) - 2.5).toFixed(1)) } : s))}
                            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/60 active:scale-95 transition-all text-base font-bold flex-shrink-0">−</button>
                          <div className="flex items-baseline justify-center w-14">
                            <span className="text-sm font-black" style={{ color: '#fb923c' }}>+</span>
                            <input
                              type="number" inputMode="decimal" value={wKg}
                              onChange={e => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, weightKg: Math.max(0, parseFloat(e.target.value) || 0) } : s))}
                              onFocus={e => e.target.select()}
                              className="w-8 text-center text-sm font-black tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              style={{ color: '#fb923c' }}
                              min={0} step={0.5}
                            />
                            <span className="text-sm font-black" style={{ color: '#fb923c' }}>kg</span>
                          </div>
                          <button
                            onClick={() => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, weightKg: +((s.weightKg ?? 10) + 2.5).toFixed(1) } : s))}
                            className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 active:scale-95 transition-all text-base font-bold flex-shrink-0">+</button>
                        </div>
                      )}

                      {popupModifier === 'band' && (
                        <div className="w-28 flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPopupSets(prev => prev.map((s, i) => {
                              if (i !== si) return s
                              const cur = s.bandKg ?? 5
                              return { ...s, bandKg: [...BANDS].reverse().find(v => v < cur) ?? BANDS[0] }
                            }))}
                            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/60 active:scale-95 transition-all text-base font-bold flex-shrink-0">−</button>
                          <div className="flex items-baseline justify-center w-14">
                            <span className="text-sm font-black" style={{ color: '#c084fc' }}>~</span>
                            <input
                              type="number" inputMode="decimal" value={bKg}
                              onChange={e => setPopupSets(prev => prev.map((s, i) => i === si ? { ...s, bandKg: Math.max(1, parseFloat(e.target.value) || 1) } : s))}
                              onFocus={e => e.target.select()}
                              className="w-8 text-center text-sm font-black tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              style={{ color: '#c084fc' }}
                              min={1} step={1}
                            />
                            <span className="text-sm font-black" style={{ color: '#c084fc' }}>kg</span>
                          </div>
                          <button
                            onClick={() => setPopupSets(prev => prev.map((s, i) => {
                              if (i !== si) return s
                              const cur = s.bandKg ?? 5
                              return { ...s, bandKg: BANDS.find(v => v > cur) ?? BANDS[BANDS.length - 1] }
                            }))}
                            className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 active:scale-95 transition-all text-base font-bold flex-shrink-0">+</button>
                        </div>
                      )}

                      <button onClick={() => setPopupSets(prev => prev.filter((_, i) => i !== si))}
                        disabled={popupSets.length <= 1}
                        className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors disabled:opacity-0 flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}

                <button
                  onClick={() => setPopupSets(prev => {
                    const last = prev[prev.length - 1] ?? {}
                    return [...prev, { ...last }]
                  })}
                  className="flex items-center gap-1.5 text-xs text-brand-green font-semibold py-3">
                  <Plus size={13} /> Adaugă set
                </button>
              </div>

              <div className="px-5 pt-2 flex-shrink-0">
                <button onClick={savePopup} className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-black">
                  Salvează
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Search sheet */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-30">
          <div className="w-full max-w-lg rounded-t-3xl flex flex-col max-h-[88vh]" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
              <p className="text-base font-black text-white">Caută exercițiu</p>
              <button aria-label="Închide" onClick={() => { setShowSearch(false); setSearchQuery('') }}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            <div className="px-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 h-10 rounded-xl px-3 border border-white/12 bg-white/7">
                <Search size={14} className="text-white/35 flex-shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ex. Tracțiuni, Flotări..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')}><X size={13} className="text-white/35" /></button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {!searchQuery.trim() && favorites.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2">⭐ FAVORITE</p>
                  <div className="flex flex-col gap-1.5">
                    {favorites.map(name => {
                      const metric   = getMetric(name, catalogue)
                      const category = getCategory(name, catalogue)
                      return (
                        <button key={name}
                          onClick={() => openLogPopup(name)}
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left bg-white/5 border border-white/8 text-white/80 hover:bg-white/10 active:scale-[0.98] transition-all">
                          <span>{name}</span>
                          <div className="flex items-center gap-1.5">
                            {category === 'Cu Greutate' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25">⚖️</span>
                            )}
                            {category === 'Cu Bandă' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">🔴</span>
                            )}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">
                              {metric === 'reps' ? 'rep' : 'sec'}
                            </span>
                            <ChevronRight size={14} className="text-white/30" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {grouped.map(group => (
                <div key={group.category} className="mb-4">
                  {group.category && (
                    <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 uppercase">{group.category}</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {group.exercises.map(({ name, metric, category }) => (
                      <button key={name}
                        onClick={() => openLogPopup(name)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left bg-white/5 border border-white/8 text-white/80 hover:bg-white/10 active:scale-[0.98] transition-all">
                        <span>{name}</span>
                        <div className="flex items-center gap-1.5">
                          {category === 'Cu Greutate' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25">⚖️</span>
                          )}
                          {category === 'Cu Bandă' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">🔴</span>
                          )}
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">
                            {metric === 'reps' ? 'rep' : 'sec'}
                          </span>
                          <ChevronRight size={14} className="text-white/30" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Log exercise popup */}
      {logExercise !== null && (() => {
        const metric = getMetric(logExercise, catalogue)
        const BANDS = [5, 15, 25, 35, 45, 55]
        const bandUp   = () => setLogBandKg(w => BANDS.find(v => v > w) ?? BANDS[BANDS.length - 1])
        const bandDown = () => setLogBandKg(w => [...BANDS].reverse().find(v => v < w) ?? BANDS[0])
        return (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-40">
            <div className="w-full max-w-lg rounded-t-3xl pb-8 overflow-y-auto max-h-[90vh]" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
                <div>
                  <p className="font-black text-white text-base">{logExercise}</p>
                  <p className="text-xs text-white/40">{getCategory(logExercise, catalogue)} · {metric === 'reps' ? 'Repetări' : 'Secunde'}</p>
                </div>
                <button onClick={() => setLogExercise(null)}
                  className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                  <X size={14} className="text-white/60" />
                </button>
              </div>

              <div className="px-5 pt-5 pb-2">
                {metric === 'reps' && (
                  <div className="mb-5">
                    <p className="text-[10px] font-bold text-white/35 tracking-widest text-center mb-4">REPETĂRI</p>
                    <div className="flex items-center justify-center gap-4">
                      <button onClick={() => setLogReps(r => Math.max(1, r - 1))}
                        className="w-14 h-14 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-3xl font-bold active:scale-95 transition-transform">−</button>
                      <input
                        type="number" inputMode="numeric" value={logReps}
                        onChange={e => setLogReps(Math.max(1, parseInt(e.target.value) || 1))}
                        onFocus={e => e.target.select()}
                        className="w-20 text-center text-6xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min={1}
                      />
                      <button onClick={() => setLogReps(r => r + 1)}
                        className="w-14 h-14 rounded-full bg-brand-green flex items-center justify-center text-black text-3xl font-bold active:scale-95 transition-transform">+</button>
                      {logExercise && getExerciseType(logExercise) !== null && (
                        <button
                          onClick={() => setShowRepCounter(true)}
                          className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center active:scale-95 transition-transform"
                          title="Numără cu camera"
                        >
                          <Camera size={17} className="text-white/60" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {metric === 'seconds' && (
                  <div className="mb-5">
                    <p className="text-[10px] font-bold text-white/35 tracking-widest text-center mb-4">SECUNDE</p>
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setLogSecs(s => Math.max(5, s - 5))}
                        className="w-14 h-14 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-3xl font-bold active:scale-95 transition-transform">−</button>
                      <div className="flex items-baseline justify-center w-24">
                        <input
                          type="number" inputMode="numeric" value={logSecs}
                          onChange={e => setLogSecs(Math.max(1, parseInt(e.target.value) || 1))}
                          onFocus={e => e.target.select()}
                          className="w-16 text-center text-6xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={1}
                        />
                        <span className="text-2xl text-white/40">s</span>
                      </div>
                      <button onClick={() => setLogSecs(s => s + 5)}
                        className="w-14 h-14 rounded-full bg-brand-green flex items-center justify-center text-black text-3xl font-bold active:scale-95 transition-transform">+</button>
                    </div>
                  </div>
                )}

                {/* Modifier toggle chips */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => { setLogWeightOn(v => !v); setLogBandOn(false) }}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      logWeightOn
                        ? 'bg-orange-500/15 border-orange-500/50 text-orange-400'
                        : 'bg-white/5 border-white/12 text-white/40 hover:text-white/60'
                    }`}
                  >
                    ⚖️ {logWeightOn ? `+${logWeight} kg` : '+ Greutate'}
                  </button>
                  <button
                    onClick={() => { setLogBandOn(v => !v); setLogWeightOn(false) }}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                      logBandOn
                        ? 'bg-purple-500/15 border-purple-500/50 text-purple-400'
                        : 'bg-white/5 border-white/12 text-white/40 hover:text-white/60'
                    }`}
                  >
                    🔴 {logBandOn ? `${logBandKg} kg` : '+ Bandă'}
                  </button>
                </div>

                {logWeightOn && (
                  <div className="mb-4 rounded-2xl bg-orange-500/10 border border-orange-500/25 px-4 py-4">
                    <p className="text-[10px] font-bold text-orange-400/70 tracking-widest text-center mb-3">GREUTATE ADĂUGATĂ</p>
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setLogWeight(w => Math.max(0, +(w - 2.5).toFixed(1)))}
                        className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-2xl font-bold active:scale-95 transition-transform">−</button>
                      <div className="flex items-baseline justify-center w-24">
                        <input
                          type="number" inputMode="decimal" value={logWeight}
                          onChange={e => setLogWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                          onFocus={e => e.target.select()}
                          className="w-16 text-center text-4xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={0} step={0.5}
                        />
                        <span className="text-lg text-orange-400/60"> kg</span>
                      </div>
                      <button onClick={() => setLogWeight(w => +(w + 2.5).toFixed(1))}
                        className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-bold active:scale-95 transition-transform">+</button>
                    </div>
                  </div>
                )}

                {logBandOn && (
                  <div className="mb-4 rounded-2xl bg-purple-500/10 border border-purple-500/25 px-4 py-4">
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={bandDown}
                        className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-2xl font-bold active:scale-95 transition-transform">−</button>
                      <div className="flex items-baseline justify-center w-24">
                        <input
                          type="number" inputMode="decimal" value={logBandKg}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setLogBandKg(v) }}
                          onFocus={e => e.target.select()}
                          className="w-16 text-center text-4xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={1} step={1}
                        />
                        <span className="text-lg text-purple-400/60"> kg</span>
                      </div>
                      <button onClick={bandUp}
                        className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold active:scale-95 transition-transform">+</button>
                    </div>
                    <div className="flex gap-1.5 mt-4 justify-center">
                      {BANDS.map(v => (
                        <button key={v} onClick={() => setLogBandKg(v)}
                          className={`flex-1 h-1.5 rounded-full transition-all ${logBandKg === v ? 'bg-purple-400' : 'bg-white/15'}`} />
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={confirmLog}
                  className="w-full rounded-2xl bg-brand-green text-black font-black text-base flex items-center justify-center gap-2"
                  style={{ height: 52 }}
                >
                  <Check size={18} /> Adaugă exercițiu
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Rep counter camera modal */}
      {showRepCounter && logExercise && getExerciseType(logExercise) !== null && (
        <RepCounterModal
          exerciseType={getExerciseType(logExercise)!}
          exerciseName={logExercise}
          onConfirm={(reps) => { setLogReps(reps); setShowRepCounter(false) }}
          onCancel={() => setShowRepCounter(false)}
        />
      )}
    </div>
  )
}
