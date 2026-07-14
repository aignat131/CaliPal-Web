'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Trash2, ChevronRight, Check, X, Square, Search, Camera, Timer, RotateCcw, Layers, Pause, Play } from 'lucide-react'
import type { WorkoutExercise, WorkoutSet, GripType } from '@/types'
import type { ActiveCircuit, ActiveTimedSet } from '@/lib/context/WorkoutContext'
import { getMetric, getCategory, groupByCategoryByCatalogue, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import RepCounterModal from '@/components/workout/RepCounterModal'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { formatDuration, totalRepsInWorkout, norm, getExerciseType } from '../_helpers'

export function ActiveWorkoutView({
  exercises, seconds, note, catalogue, isPaused, doneKeys, onNoteChange,
  onReplaceExerciseSets, onAddExercise, onRemoveExercise, onFinish, onCancel,
  onPause, onResume, onToggleSet,
  favorites, onToggleFavorite: _onToggleFavorite,
  circuits, onAddCircuit, onRemoveCircuit, onStartCircuitRound, onCompleteCircuitRound,
  activeTimedSet, onStartTimedSet, onClearTimedSet,
}: {
  exercises: WorkoutExercise[]
  seconds: number
  note: string
  catalogue: CatalogueEntry[]
  isPaused: boolean
  doneKeys: Set<string>
  onNoteChange: (v: string) => void
  onReplaceExerciseSets: (ei: number, sets: WorkoutSet[], grip?: GripType) => void
  onAddExercise: (name: string, set: WorkoutSet, grip?: GripType) => void
  onRemoveExercise: (idx: number) => void
  onFinish: () => void
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onToggleSet: (ei: number, si: number) => void
  favorites: string[]
  onToggleFavorite: (name: string) => void
  circuits: ActiveCircuit[]
  onAddCircuit: (exerciseIndices: number[], targetRounds: number) => void
  onRemoveCircuit: (circuitId: string) => void
  onStartCircuitRound: (circuitId: string) => void
  onCompleteCircuitRound: (circuitId: string) => void
  activeTimedSet: ActiveTimedSet | null
  onStartTimedSet: (exerciseIndex: number, setIndex: number, targetDurationSeconds: number) => void
  onClearTimedSet: () => void
}) {
  const [showCancel, setShowCancel] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)

  // Edit existing exercise sets popup
  const [popupExIdx, setPopupExIdx] = useState<number | null>(null)
  const [popupSets, setPopupSets] = useState<WorkoutSet[]>([])
  const [popupModifier, setPopupModifier] = useState<'none' | 'weight' | 'band'>('none')
  const [popupGrip, setPopupGrip] = useState<GripType | undefined>(undefined)

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
  const [logTimedOn, setLogTimedOn] = useState(false)
  const [logTimedMinutes, setLogTimedMinutes] = useState(3)
  const [logGrip, setLogGrip] = useState<GripType>('pronat')
  const [showRepCounter, setShowRepCounter] = useState(false)

  // Circuit creation
  const [showCircuitSheet, setShowCircuitSheet] = useState(false)
  const [circuitSelected, setCircuitSelected] = useState<Set<number>>(new Set())
  const [circuitRounds, setCircuitRounds] = useState(4)

  // Timed set countdown
  const [timedCountdown, setTimedCountdown] = useState(0)
  const timedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timedNotifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Timed set rep entry after countdown
  const [timedRepEntry, setTimedRepEntry] = useState<{ exerciseIndex: number; setIndex: number; targetDuration: number; actualDuration: number } | null>(null)
  const [timedRepCount, setTimedRepCount] = useState(10)

  // Pre-create AudioContext on timer start (needs user gesture for iOS)
  function ensureAudioCtx() {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() } catch { /* no audio */ }
    }
  }

  function playTimerBeep() {
    const ctx = audioCtxRef.current
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880; osc.type = 'sine'; gain.gain.value = 0.3
      osc.start(); osc.stop(ctx.currentTime + 0.25)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2); gain2.connect(ctx.destination)
      osc2.frequency.value = 1100; osc2.type = 'sine'; gain2.gain.value = 0.3
      osc2.start(ctx.currentTime + 0.35); osc2.stop(ctx.currentTime + 0.6)
    } catch { /* audio not available */ }
  }

  // Timed set countdown effect
  useEffect(() => {
    if (!activeTimedSet?.startedAt) {
      if (timedIntervalRef.current) { clearInterval(timedIntervalRef.current); timedIntervalRef.current = null }
      if (timedNotifTimeoutRef.current) { clearTimeout(timedNotifTimeoutRef.current); timedNotifTimeoutRef.current = null }
      return
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - activeTimedSet.startedAt!) / 1000)
      const remaining = Math.max(0, activeTimedSet.targetDurationSeconds - elapsed)
      setTimedCountdown(remaining)
      if (remaining === 0) {
        // Timer finished — notify and open rep entry
        if (timedIntervalRef.current) { clearInterval(timedIntervalRef.current); timedIntervalRef.current = null }
        navigator.vibrate?.([200, 100, 200, 100, 200])
        playTimerBeep()
        setTimedRepEntry({
          exerciseIndex: activeTimedSet.exerciseIndex,
          setIndex: activeTimedSet.setIndex,
          targetDuration: activeTimedSet.targetDurationSeconds,
          actualDuration: activeTimedSet.targetDurationSeconds,
        })
        onClearTimedSet()
      }
    }
    tick()
    timedIntervalRef.current = setInterval(tick, 1000)

    // Schedule a browser notification for when the timer expires (works in background tabs)
    const elapsed = Math.floor((Date.now() - activeTimedSet.startedAt) / 1000)
    const remaining = Math.max(0, activeTimedSet.targetDurationSeconds - elapsed)
    if (remaining > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      timedNotifTimeoutRef.current = setTimeout(() => {
        try {
          new Notification('CaliPal — Timer terminat!', {
            body: `${exercises[activeTimedSet.exerciseIndex]?.name ?? 'Exercițiu'} — timpul s-a scurs!`,
            icon: '/icons/icon-192.png',
            tag: 'timed-set-done',
          })
        } catch { /* notification failed */ }
      }, remaining * 1000)
    }

    return () => {
      if (timedIntervalRef.current) clearInterval(timedIntervalRef.current)
      if (timedNotifTimeoutRef.current) { clearTimeout(timedNotifTimeoutRef.current); timedNotifTimeoutRef.current = null }
    }
  }, [activeTimedSet, onClearTimedSet]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close AudioContext on unmount
  useEffect(() => {
    return () => { audioCtxRef.current?.close().catch(() => {}) }
  }, [])

  // Build a set of exercise indices that belong to circuits
  const circuitExerciseIndices = new Set<number>()
  circuits.forEach(c => c.exerciseIndices.forEach(i => circuitExerciseIndices.add(i)))

  const totalReps = totalRepsInWorkout(exercises)
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0)

  // Effective done keys: manual (non-program) sets are considered done,
  // EXCEPT timed sets that haven't been completed yet (reps === 0)
  const effectiveDoneKeys = new Set(doneKeys)
  exercises.forEach((ex, ei) => {
    if (!ex.fromProgram) {
      ex.sets.forEach((s, si) => {
        const isTimedIncomplete = (s.timedDurationSeconds ?? 0) > 0 && (s.reps ?? 0) === 0
        if (!isTimedIncomplete) effectiveDoneKeys.add(`${ei}-${si}`)
      })
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
    setPopupGrip(exercises[ei]?.grip)
  }

  function savePopup() {
    if (popupExIdx !== null) {
      const cleaned = popupSets.map(s => {
        const { weightKg: _w, bandKg: _b, ...rest } = s
        if (popupModifier === 'weight') return { ...rest, weightKg: s.weightKg }
        if (popupModifier === 'band')   return { ...rest, bandKg:   s.bandKg   }
        return rest
      })
      const gripVal = exercises[popupExIdx]?.category === 'Trageri' ? popupGrip : undefined
      onReplaceExerciseSets(popupExIdx, cleaned, gripVal)
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
    setLogTimedOn(false)
    setLogTimedMinutes(3)
    setLogGrip('pronat')
  }

  function confirmLog() {
    if (!logExercise) return
    const metric = getMetric(logExercise, catalogue)
    const category = getCategory(logExercise, catalogue)
    const set: WorkoutSet = logTimedOn
      ? { reps: 0, timedDurationSeconds: logTimedMinutes * 60,
          ...(logWeightOn ? { weightKg: logWeight } : {}),
          ...(logBandOn   ? { bandKg:   logBandKg } : {}),
        }
      : {
          ...(metric === 'reps' ? { reps: logReps } : { durationSeconds: logSecs }),
          ...(logWeightOn ? { weightKg: logWeight } : {}),
          ...(logBandOn   ? { bandKg:   logBandKg } : {}),
        }
    const grip = category === 'Trageri' ? logGrip : undefined
    onAddExercise(logExercise, set, grip)
    setLogExercise(null)
    setShowSearch(false)
    setSearchQuery('')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Timer bar */}
      <div className="flex-shrink-0 border-b border-white/8">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 pt-4 pb-3">
          <button onClick={() => setShowCancel(true)} aria-label="Abandonează antrenamentul" className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <Square size={14} className="text-white/60" />
          </button>
          <div className="text-center flex items-center gap-3 justify-center">
            <button
              onClick={isPaused ? onResume : onPause}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isPaused ? 'bg-brand-green animate-pulse' : 'bg-white/8 hover:bg-white/12'
              }`}
              aria-label={isPaused ? 'Continuă' : 'Pauză'}
              title={isPaused ? 'Continuă' : 'Pauză'}
            >
              {isPaused ? <Play size={14} className="text-black" /> : <Pause size={14} className="text-white/60" />}
            </button>
            <div>
              <p className={`text-2xl font-black tabular-nums ${isPaused ? 'text-yellow-400' : 'text-brand-green'}`}>{formatDuration(seconds)}</p>
              <p className="text-xs text-white/35">{totalReps} rep</p>
            {totalSets > 0 && (
              <p className="text-[10px] font-bold mt-0.5" style={{ color: doneCount === totalSets ? 'var(--accent)' : 'rgba(255,255,255,0.25)' }}>
                {doneCount}/{totalSets} serii
              </p>
            )}
            </div>
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

      {/* Paused banner */}
      {isPaused && (
        <div className="max-w-2xl mx-auto px-4 pt-2">
          <button
            onClick={onResume}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-sm font-bold active:scale-[0.98] transition-transform"
          >
            <Pause size={14} />
            Antrenament în pauză — apasă pentru a continua
          </button>
        </div>
      )}

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
                    ? 'inset 3px 0 0 var(--accent)'
                    : accentColor
                    ? `inset 3px 0 0 ${accentColor}`
                    : undefined,
                  borderColor: allDone ? 'rgba(var(--accent-rgb), 0.13)' : 'transparent',
                }}
              >
                {(accentColor && !allDone || ex.grip) && (
                  <div className="flex items-center gap-1.5 px-4 py-1.5"
                    style={{ backgroundColor: accentColor && !allDone ? `${accentColor}18` : 'rgba(59, 130, 246, 0.06)' }}>
                    {hasWeight && !allDone && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-orange-500/35 text-orange-400 bg-orange-500/10">
                        ⚖️ cu greutate
                      </span>
                    )}
                    {hasBand && !allDone && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-500/35 text-purple-400 bg-purple-500/10">
                        🔴 cu bandă
                      </span>
                    )}
                    {ex.grip && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-500/35 text-blue-400 bg-blue-500/10">
                        {ex.grip === 'pronat' ? '🤲 pronat' : ex.grip === 'supinat' ? '🔄 supinat' : '🤝 neutru'}
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
                      aria-label="Șterge exercițiu"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {ex.sets.map((s, si) => {
                      const key = `${ei}-${si}`
                      const isTimed = s.timedDurationSeconds != null && s.timedDurationSeconds > 0
                      const isTimedComplete = isTimed && (s.reps ?? 0) > 0
                      const done = isTimed ? isTimedComplete : (isManual || doneKeys.has(key))
                      const isTimedRunning = activeTimedSet?.exerciseIndex === ei && activeTimedSet?.setIndex === si && activeTimedSet.startedAt !== null
                      const val = isTimed
                        ? isTimedComplete
                          ? `${s.reps} rep în ${formatDuration(s.timedDurationSeconds!)}`
                          : `⏱ ${formatDuration(s.timedDurationSeconds!)} — apasă pentru start`
                        : s.reps != null ? `${s.reps} rep` : s.durationSeconds != null ? `${s.durationSeconds}s` : '—'
                      const mod = s.weightKg ? ` · +${s.weightKg}kg` : s.bandKg ? ` · ~${s.bandKg}kg` : ''
                      const handleTap = () => {
                        if (isTimed && !isTimedComplete && !isTimedRunning) {
                          ensureAudioCtx()
                          onStartTimedSet(ei, si, s.timedDurationSeconds!)
                        } else if (!isManual) {
                          onToggleSet(ei, si)
                        }
                      }
                      return (
                        <button
                          key={si}
                          onPointerDown={handleTap}
                          className={`flex items-center gap-2.5 w-full text-left rounded-xl px-2 py-1.5 transition-all select-none ${
                            isTimedRunning ? 'bg-cyan-500/10 animate-pulse' : done || isTimedComplete ? 'bg-brand-green/8' : isTimed ? 'bg-cyan-500/5 hover:bg-cyan-500/10' : 'hover:bg-white/4'
                          } active:scale-[0.97]`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            done || isTimedComplete ? 'bg-brand-green animate-pop-in'
                            : isTimed ? 'border border-cyan-500/40 bg-cyan-500/10'
                            : 'border border-white/20'
                          }`}>
                            {done || isTimedComplete
                              ? <Check size={12} strokeWidth={3} className="text-black" />
                              : isTimed
                                ? <Timer size={10} className="text-cyan-400" />
                                : <span className="text-[10px] font-black text-white/30">{si + 1}</span>
                            }
                          </div>
                          <span className={`text-xs font-semibold transition-colors ${
                            done || isTimedComplete ? 'text-white/30 line-through' : isTimed ? 'text-cyan-400/80' : 'text-white/55'
                          }`}>
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

          {/* Circuit wrappers */}
          {circuits.map(circuit => {
            const circuitExercises = circuit.exerciseIndices.map(i => exercises[i]).filter(Boolean)
            if (circuitExercises.length < 2) return null
            const roundsDone = circuit.completedRounds.length
            const isRunning = circuit.currentRoundStartedAt !== null
            const allDoneCircuit = roundsDone >= circuit.targetRounds
            return (
              <CircuitCard
                key={circuit.id}
                circuit={circuit}
                exercises={exercises}
                isRunning={isRunning}
                roundsDone={roundsDone}
                allDone={allDoneCircuit}
                onStart={() => onStartCircuitRound(circuit.id)}
                onComplete={() => onCompleteCircuitRound(circuit.id)}
                onRemove={() => onRemoveCircuit(circuit.id)}
              />
            )
          })}

          {/* Create circuit button */}
          {exercises.length >= 2 && (
            <button
              onClick={() => { setShowCircuitSheet(true); setCircuitSelected(new Set()); setCircuitRounds(4) }}
              className="w-full h-11 rounded-2xl border border-dashed border-brand-green/25 text-sm text-brand-green/60 flex items-center justify-center gap-2 mb-3 hover:border-brand-green/50 hover:text-brand-green transition-colors"
            >
              <Layers size={15} /> Crează circuit
            </button>
          )}

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
              <button onClick={() => { setShowFinishConfirm(false); onFinish() }}
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
                {exercises[popupExIdx].category === 'Trageri' && (
                  <div className="flex gap-2 mt-2">
                    {(['pronat', 'supinat', 'neutru'] as const).map(g => (
                      <button key={g}
                        onClick={() => setPopupGrip(g)}
                        className={`flex-1 h-9 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                          popupGrip === g
                            ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                            : 'bg-white/4 border-white/10 text-white/35'
                        }`}
                      >
                        {g === 'pronat' ? '🤲 Pronat' : g === 'supinat' ? '🔄 Supinat' : '🤝 Neutru'}
                      </button>
                    ))}
                  </div>
                )}
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
                        style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', border: '1.5px solid rgba(var(--accent-rgb), 0.33)' }}>
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
                {metric === 'reps' && !logTimedOn && (
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

                {metric === 'reps' && logTimedOn && (
                  <div className="mb-5">
                    <p className="text-[10px] font-bold text-cyan-400/70 tracking-widest text-center mb-4">DURATĂ (MINUTE)</p>
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setLogTimedMinutes(m => Math.max(1, m - 1))}
                        className="w-14 h-14 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-3xl font-bold active:scale-95 transition-transform">−</button>
                      <div className="flex items-baseline justify-center w-24">
                        <input
                          type="number" inputMode="numeric" value={logTimedMinutes}
                          onChange={e => setLogTimedMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                          onFocus={e => e.target.select()}
                          className="w-16 text-center text-6xl font-black text-cyan-400 tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min={1}
                        />
                        <span className="text-2xl text-cyan-400/40">min</span>
                      </div>
                      <button onClick={() => setLogTimedMinutes(m => m + 1)}
                        className="w-14 h-14 rounded-full bg-cyan-500 flex items-center justify-center text-black text-3xl font-bold active:scale-95 transition-transform">+</button>
                    </div>
                    <div className="flex gap-2 mt-3 justify-center">
                      {[1, 2, 3, 5, 10].map(v => (
                        <button key={v} onClick={() => setLogTimedMinutes(v)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${logTimedMinutes === v ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                          {v} min
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pe timp toggle — only for reps exercises */}
                {metric === 'reps' && (
                  <button
                    onClick={() => setLogTimedOn(v => !v)}
                    className={`w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 mb-4 ${
                      logTimedOn
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-400'
                        : 'bg-white/5 border-white/12 text-white/40 hover:text-white/60'
                    }`}
                  >
                    <Timer size={14} /> {logTimedOn ? `Pe timp — ${logTimedMinutes} min` : '⏱ Pe timp'}
                  </button>
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

                {/* Grip toggle chips — only for pull exercises */}
                {logExercise && getCategory(logExercise, catalogue) === 'Trageri' && (
                  <div className="flex gap-2 mb-4">
                    {(['pronat', 'supinat', 'neutru'] as const).map(g => (
                      <button key={g}
                        onClick={() => setLogGrip(g)}
                        className={`flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all active:scale-95 ${
                          logGrip === g
                            ? 'bg-blue-500/15 border-blue-500/50 text-blue-400'
                            : 'bg-white/5 border-white/12 text-white/40 hover:text-white/60'
                        }`}
                      >
                        {g === 'pronat' ? '🤲 Pronat' : g === 'supinat' ? '🔄 Supinat' : '🤝 Neutru'}
                      </button>
                    ))}
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

      {/* Timed set floating timer bar */}
      {activeTimedSet?.startedAt && (
        <div className="fixed bottom-20 left-4 right-4 z-30 max-w-2xl mx-auto animate-fade-in-up">
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg border border-cyan-500/30"
            style={{ backgroundColor: '#0c1a2a' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/50 truncate">
                {exercises[activeTimedSet.exerciseIndex]?.name ?? 'Exercițiu'}
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-cyan-400 tabular-nums">
                  {formatDuration(timedCountdown)}
                </p>
                <p className="text-xs text-white/25">
                  / {formatDuration(activeTimedSet.targetDurationSeconds)}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const elapsed = Math.floor((Date.now() - activeTimedSet.startedAt!) / 1000)
                setTimedRepEntry({
                  exerciseIndex: activeTimedSet.exerciseIndex,
                  setIndex: activeTimedSet.setIndex,
                  targetDuration: activeTimedSet.targetDurationSeconds,
                  actualDuration: Math.min(elapsed, activeTimedSet.targetDurationSeconds),
                })
                onClearTimedSet()
              }}
              className="h-10 px-5 rounded-full bg-red-500/80 text-white text-xs font-bold flex items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform"
            >
              <Square size={12} /> Oprește
            </button>
          </div>
        </div>
      )}

      {/* Timed set — rep entry after countdown */}
      {timedRepEntry && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="font-bold text-white text-base mb-1 text-center">
              Câte repetări ai făcut?
            </p>
            <p className="text-xs text-white/40 text-center mb-5">
              {exercises[timedRepEntry.exerciseIndex]?.name} · {formatDuration(timedRepEntry.actualDuration)}
            </p>
            <div className="flex items-center justify-center gap-4 mb-6">
              <button onClick={() => setTimedRepCount(r => Math.max(0, r - 1))}
                className="w-14 h-14 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-3xl font-bold active:scale-95 transition-transform">−</button>
              <input
                type="number" inputMode="numeric" value={timedRepCount}
                onChange={e => setTimedRepCount(Math.max(0, parseInt(e.target.value) || 0))}
                onFocus={e => e.target.select()}
                className="w-20 text-center text-5xl font-black text-white tabular-nums bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                min={0}
              />
              <button onClick={() => setTimedRepCount(r => r + 1)}
                className="w-14 h-14 rounded-full bg-brand-green flex items-center justify-center text-black text-3xl font-bold active:scale-95 transition-transform">+</button>
            </div>
            <button
              onClick={() => {
                const { exerciseIndex: eIdx, setIndex: sIdx, targetDuration } = timedRepEntry
                const ex = exercises[eIdx]
                if (ex) {
                  const newSets = ex.sets.map((s, i) =>
                    i === sIdx ? { ...s, reps: timedRepCount, timedDurationSeconds: targetDuration } : s
                  )
                  onReplaceExerciseSets(eIdx, newSets)
                }
                setTimedRepEntry(null)
              }}
              className="w-full h-12 rounded-xl bg-brand-green text-black text-sm font-black"
            >
              Salvează
            </button>
          </div>
        </div>
      )}

      {/* Circuit creation sheet */}
      {showCircuitSheet && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-30">
          <div className="w-full max-w-lg rounded-t-3xl pb-8 max-h-[80vh] flex flex-col" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 flex-shrink-0">
              <p className="text-base font-black text-white">Crează circuit</p>
              <button onClick={() => setShowCircuitSheet(false)}
                className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
                <X size={14} className="text-white/60" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pt-3">
              <p className="text-xs text-white/40 mb-3">Selectează exercițiile pentru circuit:</p>
              {exercises.map((ex, ei) => {
                if (circuitExerciseIndices.has(ei)) return null
                const selected = circuitSelected.has(ei)
                return (
                  <button
                    key={ei}
                    onClick={() => setCircuitSelected(prev => {
                      const next = new Set(prev)
                      if (next.has(ei)) next.delete(ei); else next.add(ei)
                      return next
                    })}
                    className={`flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl mb-1.5 border transition-all ${
                      selected ? 'border-brand-green/50 bg-brand-green/10' : 'border-white/8 bg-white/4'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                      selected ? 'bg-brand-green' : 'border border-white/20'
                    }`}>
                      {selected && <Check size={12} strokeWidth={3} className="text-black" />}
                    </div>
                    <span className="text-sm text-white/80 font-semibold">{ex.name}</span>
                  </button>
                )
              })}

              <div className="mt-4 mb-3">
                <p className="text-xs text-white/40 mb-2">Număr de runde:</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCircuitRounds(r => Math.max(1, r - 1))}
                    className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-white/60 text-lg font-bold active:scale-95">−</button>
                  <span className="text-2xl font-black text-white tabular-nums w-8 text-center">{circuitRounds}</span>
                  <button onClick={() => setCircuitRounds(r => r + 1)}
                    className="w-10 h-10 rounded-full bg-brand-green flex items-center justify-center text-black text-lg font-bold active:scale-95">+</button>
                </div>
              </div>
            </div>

            <div className="px-5 pt-2 flex-shrink-0">
              <button
                onClick={() => {
                  onAddCircuit(Array.from(circuitSelected).sort((a, b) => a - b), circuitRounds)
                  setShowCircuitSheet(false)
                }}
                disabled={circuitSelected.size < 2}
                className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-black disabled:opacity-40"
              >
                Crează circuit ({circuitSelected.size} exerciții)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CircuitCard ──────────────────────────────────────────────────────────────

function CircuitCard({
  circuit, exercises, isRunning, roundsDone, allDone,
  onStart, onComplete, onRemove,
}: {
  circuit: ActiveCircuit
  exercises: WorkoutExercise[]
  isRunning: boolean
  roundsDone: number
  allDone: boolean
  onStart: () => void
  onComplete: () => void
  onRemove: () => void
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning || circuit.currentRoundStartedAt === null) {
      setElapsed(0)
      return
    }
    const tick = () => setElapsed(Math.floor((Date.now() - circuit.currentRoundStartedAt!) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isRunning, circuit.currentRoundStartedAt])

  return (
    <div className="rounded-2xl mb-3 overflow-hidden border border-brand-green/25 bg-brand-green/5"
      style={{ boxShadow: 'inset 3px 0 0 var(--accent)' }}>
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-brand-green" />
            <span className="text-sm font-black text-white">Circuit</span>
            {isRunning && (
              <span className="text-sm font-black text-brand-green tabular-nums">
                Runda {roundsDone + 1}/{circuit.targetRounds} — {formatDuration(elapsed)}
              </span>
            )}
            {!isRunning && roundsDone > 0 && (
              <span className="text-xs text-white/40">
                {allDone ? `✓ ${roundsDone} runde completate` : `${roundsDone}/${circuit.targetRounds} runde`}
              </span>
            )}
          </div>
          <button onClick={onRemove} className="w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            <X size={13} />
          </button>
        </div>

        {/* Exercise names */}
        <div className="flex flex-col gap-0.5 mb-3">
          {circuit.exerciseIndices.map(i => {
            const ex = exercises[i]
            if (!ex) return null
            return (
              <p key={i} className="text-xs text-white/60 pl-1">
                • {ex.name} · {ex.sets.length > 0
                  ? ex.sets[0].reps != null ? `${ex.sets[0].reps} rep` : `${ex.sets[0].durationSeconds ?? 0}s`
                  : '—'}
              </p>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {isRunning ? (
            <button onClick={onComplete}
              className="flex-1 h-10 rounded-xl bg-brand-green text-black text-xs font-black flex items-center justify-center gap-1.5">
              <Check size={14} strokeWidth={3} /> Gata runda
            </button>
          ) : !allDone ? (
            <button onClick={onStart}
              className="flex-1 h-10 rounded-xl bg-brand-green/15 border border-brand-green/30 text-brand-green text-xs font-bold flex items-center justify-center gap-1.5">
              <RotateCcw size={14} /> {roundsDone === 0 ? 'Start circuit' : 'Reia circuitul'}
            </button>
          ) : null}
        </div>

        {/* Completed round times */}
        {circuit.completedRounds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {circuit.completedRounds.map((r, i) => (
              <span key={i} className="text-[10px] font-bold px-2 py-1 rounded-full bg-brand-green/10 text-brand-green/70 border border-brand-green/20">
                R{r.roundNumber}: {formatDuration(r.durationSeconds)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
