'use client'

import { useRef, useState } from 'react'
import { useToast } from '@/lib/context/ToastContext'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { callApi, apiErrorMessage } from '@/lib/schedule/client'
import { FOCUS_OPTIONS, FOCUS_EMOJI, endTimeOf } from '@/lib/schedule/sessions'
import { DAY_NAMES, weekDays, weekStartOf } from '@/lib/schedule/week'
import type { TrainingExercise } from '@/types'
import { useCommunityParks, useSessionTemplates } from './useTemplates'
import { X, Plus } from 'lucide-react'

export interface SessionPrefill {
  date: string       // yyyy-MM-dd
  hour: number
  availableCount?: number
}

const inputCls = 'h-10 w-full rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60'

/** "Programează antrenament" — bottom sheet used from the heatmap and the Plan view. */
export function SessionSheet({ communityId, prefill, defaultLocation, onClose, onCreated }: {
  communityId: string
  prefill: SessionPrefill
  defaultLocation: string
  onClose: () => void
  onCreated?: (trainingId: string) => void
}) {
  const { showToast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
  const templates = useSessionTemplates(communityId)
  const parks = useCommunityParks(communityId)

  const [templateId, setTemplateId] = useState('')
  const [focus, setFocus] = useState<string>('Full body')
  const [customFocus, setCustomFocus] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState(prefill.date)
  const [startTime, setStartTime] = useState(`${String(prefill.hour).padStart(2, '0')}:00`)
  const [duration, setDuration] = useState(90)
  const [parkId, setParkId] = useState('')
  const [location, setLocation] = useState(defaultLocation)
  const [capacity, setCapacity] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState<TrainingExercise[]>([])
  const [saving, setSaving] = useState(false)

  const effectiveFocus = focus === 'custom' ? customFocus.trim() : focus
  const day = weekDays(weekStartOf(date)).find(d => d.dateKey === date)

  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find(x => x.id === id)
    if (!t) return
    if ((FOCUS_OPTIONS as readonly string[]).includes(t.focus)) setFocus(t.focus)
    else { setFocus('custom'); setCustomFocus(t.focus) }
    setName(t.name)
    setDuration(t.durationMinutes)
    setExercises(t.exercises)
    if (t.notes) setNotes(t.notes)
  }

  async function submit() {
    if (!effectiveFocus || saving) return
    setSaving(true)
    const res = await callApi<{ trainingId: string }>(`/api/community/${communityId}/sessions`, {
      name: name.trim(),
      focus: effectiveFocus,
      date,
      startTime,
      durationMinutes: duration,
      location: location.trim(),
      parkId: parkId || null,
      capacity: capacity ? Number(capacity) : null,
      notes: notes.trim(),
      templateId: templateId || null,
      exercises,
    })
    setSaving(false)
    if (!res.ok) { showToast(apiErrorMessage(res.reason), 'error'); return }
    showToast('Antrenament programat! Membrii au fost anunțați. 📣', 'success')
    onCreated?.(res.data.trainingId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Programează antrenament"
        className="w-full max-w-lg rounded-t-3xl p-5 pb-8 max-h-[90dvh] overflow-y-auto"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center mb-1">
          <p className="text-base font-black text-white flex-1">Programează antrenament</p>
          <button onClick={onClose} aria-label="Închide" className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X size={15} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/45 mb-4">
          {day ? `${DAY_NAMES[day.index]} ${day.dayMonth}` : date} · {startTime}–{endTimeOf(startTime, duration)}
          {prefill.availableCount !== undefined && ` · ${prefill.availableCount} disponibili`}
        </p>

        <div className="flex flex-col gap-3">
          {templates.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/45">Șablon</span>
              <select value={templateId} onChange={e => applyTemplate(e.target.value)} className={inputCls}>
                <option value="">Fără șablon</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/45">Focus</span>
            <div className="flex flex-wrap gap-1.5">
              {[...FOCUS_OPTIONS, 'custom'].map(f => (
                <button key={f} type="button" onClick={() => setFocus(f)} aria-pressed={focus === f}
                  className={`h-8 px-3 rounded-full text-xs font-bold border ${focus === f ? 'bg-brand-green text-black border-brand-green' : 'border-white/15 text-white/60'}`}>
                  {f === 'custom' ? '✏️ Altul' : `${FOCUS_EMOJI[f]} ${f}`}
                </button>
              ))}
            </div>
            {focus === 'custom' && (
              <input value={customFocus} onChange={e => setCustomFocus(e.target.value)} maxLength={40}
                placeholder="ex: Mobilitate, Handstand…" className={`${inputCls} mt-1`} />
            )}
          </div>

          <input value={name} onChange={e => setName(e.target.value)} maxLength={120}
            placeholder={`Nume (implicit: Antrenament ${effectiveFocus || '…'})`} className={inputCls} />

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 col-span-1">
              <span className="text-xs text-white/45">Data</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/45">Ora</span>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/45">Durată</span>
              <select value={duration} onChange={e => setDuration(+e.target.value)} className={inputCls}>
                {[45, 60, 75, 90, 105, 120, 150, 180].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
          </div>

          {parks.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/45">Parc</span>
              <select value={parkId} onChange={e => {
                setParkId(e.target.value)
                const p = parks.find(x => x.id === e.target.value)
                if (p) setLocation(p.name)
              }} className={inputCls}>
                <option value="">Altă locație</option>
                {parks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {!parkId && (
            <input value={location} onChange={e => setLocation(e.target.value)} maxLength={100}
              placeholder="Locație" className={inputCls} />
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/45">Limită de locuri (opțional)</span>
            <input type="number" min={1} max={500} inputMode="numeric" value={capacity}
              onChange={e => setCapacity(e.target.value)} placeholder="Nelimitat" className={inputCls} />
          </label>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={3}
            placeholder="Note (ce aducem, la ce să se aștepte…)"
            className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 resize-none" />

          <ExerciseListEditor value={exercises} onChange={setExercises} />

          <button onClick={() => void submit()} disabled={saving || !effectiveFocus}
            className="h-12 rounded-2xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
            {saving ? 'Se programează…' : 'Programează și anunță membrii'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Small editor for a list of exercises (name, sets × reps). Shared with templates. */
export function ExerciseListEditor({ value, onChange }: {
  value: TrainingExercise[]
  onChange: (v: TrainingExercise[]) => void
}) {
  const update = (i: number, patch: Partial<TrainingExercise>) =>
    onChange(value.map((e, j) => j === i ? { ...e, ...patch } : e))
  const cell = 'h-9 rounded-lg px-2 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60'
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-white/45">Exerciții</span>
        <button type="button" onClick={() => onChange([...value, { name: '', sets: 3, repsPerSet: 10 }])}
          className="text-xs text-brand-green font-bold flex items-center gap-0.5"><Plus size={12} /> Adaugă</button>
      </div>
      {value.map((ex, i) => (
        <div key={i} className="flex gap-1.5 mb-1.5 items-center">
          <input value={ex.name} onChange={e => update(i, { name: e.target.value })} placeholder="Exercițiu" maxLength={80}
            className={`${cell} flex-1 min-w-0 placeholder:text-white/30`} />
          <input type="number" min={1} value={ex.sets} onChange={e => update(i, { sets: Math.max(1, parseInt(e.target.value) || 1) })}
            aria-label="Seturi" className={`${cell} w-12 text-center`} />
          <span className="text-white/30 text-xs">×</span>
          <input type="number" min={1} value={ex.repsPerSet} onChange={e => update(i, { repsPerSet: Math.max(1, parseInt(e.target.value) || 1) })}
            aria-label="Repetări" className={`${cell} w-12 text-center`} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Șterge exercițiul"
            className="w-7 h-7 rounded-full flex items-center justify-center text-red-400/60 hover:text-red-400">×</button>
        </div>
      ))}
    </div>
  )
}
