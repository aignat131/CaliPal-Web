'use client'

import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import { FOCUS_OPTIONS, focusLabel, type SessionTemplate } from '@/lib/schedule/sessions'
import type { TrainingExercise } from '@/types'
import { useSessionTemplates } from './useTemplates'
import { ExerciseListEditor } from './SessionSheet'
import { Pencil, Plus, Trash2 } from 'lucide-react'

const inputCls = 'h-10 w-full rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60'

/** CRUD for per-community session templates (Fondator / Antrenor). */
export function TemplatesManager({ communityId, uid }: { communityId: string; uid: string }) {
  const templates = useSessionTemplates(communityId)
  const [editing, setEditing] = useState<SessionTemplate | 'new' | null>(null)
  const { showToast } = useToast()

  async function remove(t: SessionTemplate) {
    if (!confirm(`Ștergi șablonul „${t.name}”?`)) return
    try { await deleteDoc(doc(db, 'communities', communityId, 'sessionTemplates', t.id)) }
    catch { showToast('Nu am putut șterge șablonul.', 'error') }
  }

  if (editing) {
    return <TemplateForm communityId={communityId} uid={uid}
      initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
  }

  return (
    <div className="flex flex-col gap-2">
      {templates.length === 0 && (
        <p className="text-xs text-white/40">Niciun șablon încă. Un șablon salvează focusul, durata și lista de exerciții (ex: „Pull standard”).</p>
      )}
      {templates.map(t => (
        <div key={t.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{t.name}</p>
            <p className="text-[11px] text-white/45">{focusLabel(t.focus)} · {t.durationMinutes} min · {t.exercises.length} exerciții</p>
          </div>
          <button onClick={() => setEditing(t)} aria-label={`Editează ${t.name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/8"><Pencil size={13} /></button>
          <button onClick={() => void remove(t)} aria-label={`Șterge ${t.name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-red-400/60 hover:bg-red-500/10"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={() => setEditing('new')}
        className="h-10 rounded-xl border border-brand-green/40 text-brand-green text-sm font-bold flex items-center justify-center gap-1.5">
        <Plus size={14} /> Șablon nou
      </button>
    </div>
  )
}

function TemplateForm({ communityId, uid, initial, onDone }: {
  communityId: string
  uid: string
  initial: SessionTemplate | null
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [focus, setFocus] = useState(initial?.focus ?? 'Pull')
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 90)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [exercises, setExercises] = useState<TrainingExercise[]>(initial?.exercises ?? [])
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || !focus.trim()) return
    setSaving(true)
    const data = {
      name: name.trim().slice(0, 80),
      focus: focus.trim().slice(0, 40),
      durationMinutes: duration,
      notes: notes.trim().slice(0, 1000),
      exercises: exercises.filter(e => e.name.trim()).map(e => ({ name: e.name.trim(), sets: e.sets, repsPerSet: e.repsPerSet })),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }
    try {
      if (initial) await setDoc(doc(db, 'communities', communityId, 'sessionTemplates', initial.id), data)
      else await addDoc(collection(db, 'communities', communityId, 'sessionTemplates'), data)
      onDone()
    } catch {
      showToast('Nu am putut salva șablonul.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Nume șablon (ex: Pull standard)" className={inputCls} />
      <div className="flex gap-2">
        <input value={focus} onChange={e => setFocus(e.target.value)} maxLength={40} list="focus-options" placeholder="Focus" className={inputCls} />
        <datalist id="focus-options">{FOCUS_OPTIONS.map(f => <option key={f} value={f} />)}</datalist>
        <select value={duration} onChange={e => setDuration(+e.target.value)} className={`${inputCls} w-28`} aria-label="Durată">
          {[45, 60, 75, 90, 105, 120, 150, 180].map(m => <option key={m} value={m}>{m} min</option>)}
        </select>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Note"
        className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 resize-none" />
      <ExerciseListEditor value={exercises} onChange={setExercises} />
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
        <button onClick={() => void save()} disabled={saving || !name.trim() || !focus.trim()}
          className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
          {saving ? '…' : 'Salvează'}
        </button>
      </div>
    </div>
  )
}
