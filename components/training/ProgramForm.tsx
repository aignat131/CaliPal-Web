'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  collection, addDoc, updateDoc, doc, serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { DEFAULT_EXERCISE_CATALOGUE, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import type { FirestoreTrainingProgram } from '@/types'
import type { ProgramWeek, ProgramDay, ProgramExercise } from '@/lib/data/training-programs'
import { Plus, Trash2, X, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
const LEVEL_LABELS: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }
const EMOJI_OPTIONS = ['\u{1F4AA}', '\u{1F3CB}\u{FE0F}', '\u{1F9BE}', '\u{1F3AF}', '\u{26A1}', '\u{1F525}', '\u{1F3C6}', '\u{1F9D7}', '\u{1F938}', '\u{1F9D8}']

function emptyExercise(): ProgramExercise {
  return { name: '', sets: 3, repsPerSet: 10, metric: 'reps' }
}

function emptyDay(dayNum: number): ProgramDay {
  return { dayLabel: `Day ${dayNum}`, exercises: [emptyExercise()], restDay: false }
}

function emptyWeek(weekNum: number): ProgramWeek {
  return { weekNumber: weekNum, weekLabel: `Week ${weekNum}`, days: [emptyDay(1), emptyDay(2), emptyDay(3)] }
}

interface ProgramFormProps {
  program: FirestoreTrainingProgram | null
  nextOrder: number
  onClose: () => void
  /** UID of the creator — omit for superadmin-created programs */
  creatorUid?: string
  /** Whether to show the "Published" toggle (superadmin only) */
  showPublishedToggle?: boolean
}

export default function ProgramForm({
  program, nextOrder, onClose, creatorUid, showPublishedToggle = false,
}: ProgramFormProps) {
  const t = useT()
  const isEdit = !!program

  const [name, setName] = useState(program?.name ?? '')
  const [description, setDescription] = useState(program?.description ?? '')
  const [level, setLevel] = useState<typeof LEVELS[number]>(program?.level ?? 'beginner')
  const [focusEmoji, setFocusEmoji] = useState(program?.focusEmoji ?? '\u{1F4AA}')
  const [focusLabel, setFocusLabel] = useState(program?.focusLabel ?? '')
  const [published, setPublished] = useState(program?.published ?? false)
  const [weeks, setWeeks] = useState<ProgramWeek[]>(
    program?.weeks?.length ? structuredClone(program.weeks) : [emptyWeek(1)]
  )
  const [saving, setSaving] = useState(false)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([0]))
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  // Exercise catalogue for picker
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>(DEFAULT_EXERCISE_CATALOGUE)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exercise_catalogue'), snap => {
      if (!snap.empty) {
        setCatalogue(snap.docs.map(d => d.data() as CatalogueEntry).sort((a, b) => a.name.localeCompare(b.name, 'ro')))
      }
    }, () => {})
    return unsub
  }, [])

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50"

  function toggleWeek(idx: number) {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function toggleDay(key: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ── Week mutations ─────────────────────────────────────────────────
  function addWeek() {
    setWeeks(prev => [...prev, emptyWeek(prev.length + 1)])
    setExpandedWeeks(prev => new Set([...prev, weeks.length]))
  }

  function removeWeek(wi: number) {
    if (weeks.length <= 1) return
    setWeeks(prev => prev.filter((_, i) => i !== wi).map((w, i) => ({ ...w, weekNumber: i + 1 })))
  }

  function updateWeekLabel(wi: number, label: string) {
    setWeeks(prev => prev.map((w, i) => i === wi ? { ...w, weekLabel: label } : w))
  }

  // ── Day mutations ──────────────────────────────────────────────────
  function addDay(wi: number) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? { ...w, days: [...w.days, emptyDay(w.days.length + 1)] } : w
    ))
    setExpandedDays(prev => new Set([...prev, `${wi}-${weeks[wi].days.length}`]))
  }

  function removeDay(wi: number, di: number) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? { ...w, days: w.days.filter((_, j) => j !== di) } : w
    ))
  }

  function updateDayLabel(wi: number, di: number, label: string) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? { ...w, days: w.days.map((d, j) => j === di ? { ...d, dayLabel: label } : d) } : w
    ))
  }

  function toggleRestDay(wi: number, di: number) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? { ...w, days: w.days.map((d, j) => j === di ? { ...d, restDay: !d.restDay } : d) } : w
    ))
  }

  // ── Exercise mutations ─────────────────────────────────────────────
  function addExercise(wi: number, di: number) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? {
        ...w, days: w.days.map((d, j) =>
          j === di ? { ...d, exercises: [...d.exercises, emptyExercise()] } : d
        ),
      } : w
    ))
  }

  function removeExercise(wi: number, di: number, ei: number) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? {
        ...w, days: w.days.map((d, j) =>
          j === di ? { ...d, exercises: d.exercises.filter((_, k) => k !== ei) } : d
        ),
      } : w
    ))
  }

  function updateExercise(wi: number, di: number, ei: number, field: string, value: string | number) {
    setWeeks(prev => prev.map((w, i) =>
      i === wi ? {
        ...w, days: w.days.map((d, j) =>
          j === di ? {
            ...d, exercises: d.exercises.map((ex, k) =>
              k === ei ? { ...ex, [field]: value } : ex
            ),
          } : d
        ),
      } : w
    ))
  }

  // ── Copy week ──────────────────────────────────────────────────────
  function duplicateWeek(wi: number) {
    const source = weeks[wi]
    const copy: ProgramWeek = {
      ...structuredClone(source),
      weekNumber: weeks.length + 1,
      weekLabel: `${source.weekLabel} (copy)`,
    }
    setWeeks(prev => [...prev, copy])
    setExpandedWeeks(prev => new Set([...prev, weeks.length]))
  }

  // ── Save ───────────────────────────────────────────────────────────
  async function save() {
    if (!name.trim() || weeks.length === 0) return
    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {
        name: name.trim(),
        description: description.trim(),
        level,
        durationWeeks: weeks.length,
        focusEmoji,
        focusLabel: focusLabel.trim() || name.trim(),
        published: showPublishedToggle ? published : false,
        weeks,
        updatedAt: serverTimestamp(),
      }
      if (isEdit && program) {
        await updateDoc(doc(db, 'training_programs', program.id), data)
      } else {
        await addDoc(collection(db, 'training_programs'), {
          ...data,
          order: nextOrder,
          createdAt: serverTimestamp(),
          ...(creatorUid ? { creatorUid } : {}),
        })
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-blue-400/25" style={{ backgroundColor: 'var(--app-surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-white">{isEdit ? t('program.edit') : t('program.new')}</p>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/60" />
        </button>
      </div>

      {/* ── Metadata ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 mb-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('program.namePlaceholder')} className={inputCls} />
        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder={t('program.descPlaceholder')} rows={2}
          className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 resize-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">{t('program.level')}</p>
            <select value={level} onChange={e => setLevel(e.target.value as typeof level)}
              className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[var(--app-bg)]">
              {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">{t('program.label')}</p>
            <input value={focusLabel} onChange={e => setFocusLabel(e.target.value)}
              placeholder="ex: Push / Pull / Legs" className={inputCls} />
          </div>
        </div>

        {/* Emoji picker */}
        <div>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">EMOJI</p>
          <div className="flex gap-1.5 flex-wrap">
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => setFocusEmoji(e)}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                  focusEmoji === e ? 'bg-brand-green/20 border border-brand-green/40' : 'bg-white/5 border border-white/8'
                }`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Published toggle — only for superadmins */}
        {showPublishedToggle && (
          <div className="flex items-center justify-between p-2.5 rounded-xl border border-white/8" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <span className="text-sm text-white/70">{t('program.published')}</span>
            <button
              type="button"
              onClick={() => setPublished(p => !p)}
              className="w-11 h-6 rounded-full transition-colors flex-shrink-0 relative"
              style={{ backgroundColor: published ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }}
            >
              <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ left: published ? '22px' : '2px' }} />
            </button>
          </div>
        )}
      </div>

      {/* ── Weeks ─────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('program.weeks')}</p>
      <div className="flex flex-col gap-2 mb-3">
        {weeks.map((week, wi) => {
          const isExpanded = expandedWeeks.has(wi)
          return (
            <div key={wi} className="rounded-xl border border-white/8" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
              {/* Week header */}
              <button
                onClick={() => toggleWeek(wi)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/3 transition-colors rounded-xl"
              >
                {isExpanded ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
                <GripVertical size={12} className="text-white/20" />
                <span className="text-sm font-bold text-white flex-1 text-left">{week.weekLabel}</span>
                <span className="text-[10px] text-white/30">{week.days.length} {t('program.days')}</span>
                {weeks.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); removeWeek(wi) }}
                    className="w-6 h-6 rounded-md bg-red-500/10 flex items-center justify-center ml-1">
                    <Trash2 size={10} className="text-red-400" />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); duplicateWeek(wi) }}
                  className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center"
                  title={t('program.duplicateWeek')}>
                  <Plus size={10} className="text-blue-400" />
                </button>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-white/5">
                  {/* Week label input */}
                  <input value={week.weekLabel} onChange={e => updateWeekLabel(wi, e.target.value)}
                    className={`${inputCls} mt-2 mb-2`} placeholder={t('program.weekLabel')} />

                  {/* Days */}
                  {week.days.map((day, di) => {
                    const dayKey = `${wi}-${di}`
                    const dayExpanded = expandedDays.has(dayKey)
                    return (
                      <div key={di} className="rounded-lg border border-white/6 mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.015)' }}>
                        {/* Day header */}
                        <button
                          onClick={() => toggleDay(dayKey)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/3 transition-colors rounded-lg"
                        >
                          {dayExpanded ? <ChevronDown size={12} className="text-white/30" /> : <ChevronRight size={12} className="text-white/30" />}
                          <span className="text-xs font-bold text-white/80 flex-1 text-left">{day.dayLabel}</span>
                          {day.restDay && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">{t('program.rest')}</span>}
                          <span className="text-[10px] text-white/25">{day.exercises.length} ex</span>
                          {week.days.length > 1 && (
                            <button onClick={e => { e.stopPropagation(); removeDay(wi, di) }}
                              className="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center">
                              <Trash2 size={9} className="text-red-400" />
                            </button>
                          )}
                        </button>

                        {dayExpanded && (
                          <div className="px-2.5 pb-2.5 border-t border-white/4">
                            {/* Day label + rest toggle */}
                            <div className="flex gap-2 mt-2 mb-2">
                              <input value={day.dayLabel} onChange={e => updateDayLabel(wi, di, e.target.value)}
                                className={`flex-1 ${inputCls}`} placeholder={t('program.dayLabel')} />
                              <button
                                onClick={() => toggleRestDay(wi, di)}
                                className={`h-10 px-3 rounded-xl text-xs font-bold transition-colors flex-shrink-0 ${
                                  day.restDay ? 'bg-blue-500 text-white' : 'border border-white/15 text-white/40'
                                }`}
                              >
                                {t('program.rest')}
                              </button>
                            </div>

                            {/* Exercises */}
                            {!day.restDay && (
                              <>
                                {day.exercises.map((ex, ei) => (
                                  <ExerciseRow
                                    key={ei}
                                    exercise={ex}
                                    catalogue={catalogue}
                                    onUpdate={(field, value) => updateExercise(wi, di, ei, field, value)}
                                    onRemove={() => removeExercise(wi, di, ei)}
                                    canRemove={day.exercises.length > 1}
                                  />
                                ))}
                                <button
                                  onClick={() => addExercise(wi, di)}
                                  className="w-full h-8 rounded-lg border border-dashed border-white/15 text-xs font-medium text-white/40 hover:text-white/60 hover:border-white/25 transition-colors flex items-center justify-center gap-1 mt-1"
                                >
                                  <Plus size={11} /> {t('program.addExercise')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add day button */}
                  <button
                    onClick={() => addDay(wi)}
                    className="w-full h-8 rounded-lg border border-dashed border-white/12 text-xs font-medium text-white/35 hover:text-white/55 hover:border-white/20 transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus size={11} /> {t('program.addDay')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add week button */}
      <button
        onClick={addWeek}
        className="w-full h-9 rounded-xl border border-dashed border-white/15 text-xs font-medium text-white/40 hover:text-white/60 hover:border-white/25 transition-colors flex items-center justify-center gap-1 mb-4"
      >
        <Plus size={12} /> {t('program.addWeek')}
      </button>

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">{t('program.cancel')}</button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex-[2] h-10 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40"
        >
          {saving ? '...' : isEdit ? t('program.save') : t('program.create')}
        </button>
      </div>
    </div>
  )
}

// ── Exercise Row ──────────────────────────────────────────────────────────────

const inputSmCls = "h-9 rounded-lg px-2 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 text-center"

function ExerciseRow({
  exercise, catalogue, onUpdate, onRemove, canRemove,
}: {
  exercise: ProgramExercise
  catalogue: CatalogueEntry[]
  onUpdate: (field: string, value: string | number) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const filtered = catalogue.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  // Group by category
  const grouped = new Map<string, CatalogueEntry[]>()
  for (const e of filtered) {
    const arr = grouped.get(e.category) ?? []
    arr.push(e)
    grouped.set(e.category, arr)
  }

  const openPicker = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const maxH = 240
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8

      if (spaceBelow >= maxH || spaceBelow >= spaceAbove) {
        // Open below
        setDropdownStyle({
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(256, rect.width),
          maxHeight: Math.min(maxH, spaceBelow),
          zIndex: 9999,
        })
      } else {
        // Open above
        setDropdownStyle({
          position: 'fixed',
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          width: Math.max(256, rect.width),
          maxHeight: Math.min(maxH, spaceAbove),
          zIndex: 9999,
        })
      }
    }
    setShowPicker(p => !p)
  }, [])

  return (
    <div className="flex items-center gap-1.5 mb-1.5 relative">
      {/* Exercise name (click to pick) */}
      <button
        ref={buttonRef}
        onClick={openPicker}
        className="flex-1 h-9 rounded-lg px-2 text-xs font-medium text-left border border-white/12 bg-white/5 text-white/80 truncate hover:border-white/20 transition-colors min-w-0"
      >
        {exercise.name || 'Choose exercise...'}
      </button>

      {/* Sets */}
      <input
        type="number" min={1} max={20}
        value={exercise.sets}
        onChange={e => onUpdate('sets', Math.max(1, parseInt(e.target.value, 10) || 1))}
        className={`w-12 ${inputSmCls}`}
        title="Sets"
      />
      <span className="text-[10px] text-white/30">{'\u00D7'}</span>
      {/* Reps */}
      <input
        type="number" min={1} max={999}
        value={exercise.repsPerSet}
        onChange={e => onUpdate('repsPerSet', Math.max(1, parseInt(e.target.value, 10) || 1))}
        className={`w-14 ${inputSmCls}`}
        title="Reps/set"
      />

      {/* Metric toggle */}
      <button
        onClick={() => onUpdate('metric', exercise.metric === 'reps' ? 'seconds' : 'reps')}
        className={`h-9 px-1.5 rounded-lg text-[9px] font-black flex-shrink-0 transition-colors ${
          exercise.metric === 'seconds' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/8 text-white/40'
        }`}
        title="Reps / Seconds"
      >
        {exercise.metric === 'seconds' ? 'SEC' : 'REP'}
      </button>

      {/* Remove */}
      {canRemove && (
        <button onClick={onRemove} className="w-7 h-7 rounded-md bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <X size={10} className="text-red-400" />
        </button>
      )}

      {/* Exercise picker dropdown — fixed positioning to escape overflow-hidden parents */}
      {showPicker && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowPicker(false)} />
          <div
            className="overflow-y-auto rounded-xl border border-white/15 shadow-xl"
            style={{ ...dropdownStyle, backgroundColor: 'var(--app-bg)' }}
          >
            <div className="sticky top-0 p-2" style={{ backgroundColor: 'var(--app-bg)' }}>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search exercise..."
                className="w-full h-8 rounded-lg px-2 text-xs text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7"
              />
            </div>
            {Array.from(grouped.entries()).map(([cat, entries]) => (
              <div key={cat}>
                <p className="text-[9px] font-bold text-white/25 tracking-widest px-3 py-1 uppercase">{cat}</p>
                {entries.map(e => (
                  <button key={e.name}
                    onClick={() => { onUpdate('name', e.name); onUpdate('metric', e.metric); setShowPicker(false); setSearch('') }}
                    className="w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/8 transition-colors">
                    {e.name}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-white/30 text-center">No results</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
