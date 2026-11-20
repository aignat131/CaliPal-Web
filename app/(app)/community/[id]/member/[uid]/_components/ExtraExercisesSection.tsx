'use client'

import { useEffect, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import { exerciseCompletion, formatPrescription, type ExerciseUnit, type ExtraExercise } from '@/lib/schedule/goals'
import { currentWeekStart } from '@/lib/schedule/week'
import { Section, areaCls, fieldCls } from './Section'
import { ClipboardList, Minus, Pencil, Plus, Trash2, Archive, ArchiveRestore } from 'lucide-react'

function toExercise(id: string, x: Record<string, unknown>): ExtraExercise {
  const n = (v: unknown, d: number) => (Number.isInteger(v) ? (v as number) : d)
  return {
    id,
    name: (x.name as string) ?? '',
    sets: n(x.sets, 3),
    amount: n(x.amount, 10),
    unit: x.unit === 'sec' ? 'sec' : 'reps',
    perWeek: n(x.perWeek, 2),
    deficiency: (x.deficiency as string) ?? '',
    notes: (x.notes as string) ?? '',
    assignedByName: (x.assignedByName as string) ?? '',
    active: x.active !== false,
    checks: (x.checks as Record<string, number>) ?? {},
    createdAtMs: (x.createdAt as Timestamp | undefined)?.toMillis?.() ?? null,
  }
}

export function ExtraExercisesSection({ communityId, uid, isOwner, canAssign, coachUid, coachName }: {
  communityId: string
  uid: string
  isOwner: boolean
  canAssign: boolean
  coachUid: string
  coachName: string
}) {
  const { showToast } = useToast()
  const [list, setList] = useState<ExtraExercise[] | null>(null)
  const [editing, setEditing] = useState<ExtraExercise | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const week = currentWeekStart()

  useEffect(() => {
    return onSnapshot(collection(db, 'communities', communityId, 'memberPlans', uid, 'extraExercises'), snap => {
      setList(snap.docs.map(d => toExercise(d.id, d.data())).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)))
    }, () => setList([]))
  }, [communityId, uid])

  const ref = (id: string) => doc(db, 'communities', communityId, 'memberPlans', uid, 'extraExercises', id)

  async function tick(e: ExtraExercise, delta: 1 | -1) {
    const cur = e.checks[week] ?? 0
    const next = Math.max(0, Math.min(e.perWeek, cur + delta))
    if (next === cur) return
    // optimistic
    setList(prev => prev?.map(x => x.id === e.id ? { ...x, checks: { ...x.checks, [week]: next } } : x) ?? prev)
    try { await updateDoc(ref(e.id), { [`checks.${week}`]: next }) }
    catch { showToast('Nu am putut salva bifa.', 'error') }
  }

  async function setActive(e: ExtraExercise, active: boolean) {
    try { await updateDoc(ref(e.id), { active }) } catch { showToast('Eroare la salvare.', 'error') }
  }

  async function remove(e: ExtraExercise) {
    if (!confirm(`Ștergi exercițiul „${e.name}”?`)) return
    try { await deleteDoc(ref(e.id)) } catch { showToast('Nu am putut șterge.', 'error') }
  }

  const active = list?.filter(e => e.active) ?? []
  const archived = list?.filter(e => !e.active) ?? []

  return (
    <Section title="Exerciții extra de la antrenor" icon={<ClipboardList size={11} />}
      action={canAssign && !editing ? (
        <button onClick={() => setEditing('new')} className="text-xs font-bold text-brand-green flex items-center gap-0.5">
          <Plus size={12} /> Atribuie
        </button>
      ) : undefined}>
      {editing && (
        <ExerciseForm communityId={communityId} uid={uid} coachUid={coachUid} coachName={coachName}
          initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}
      {list === null ? (
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
      ) : active.length === 0 && !editing ? (
        <p className="text-xs text-white/40">
          {canAssign ? 'Atribuie exerciții pentru carențele membrului (ex: scapula pull-ups pentru tracțiuni).' : 'Antrenorul nu ți-a atribuit încă exerciții extra.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-white/8">
          {active.map(e => {
            const done = e.checks[week] ?? 0
            const comp = exerciseCompletion(e, week)
            return (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{e.name}</p>
                    <p className="text-[12px] text-white/55">{formatPrescription(e)}</p>
                    {e.deficiency && (
                      <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-[#FFB800]/12 text-[#FFB800]">Carență: {e.deficiency}</span>
                    )}
                    {e.notes && <p className="text-[12px] text-white/45 mt-1 whitespace-pre-line">{e.notes}</p>}
                    <p className="text-[11px] text-white/30 mt-1">
                      Ultimele 4 săpt.: {Math.round(comp.ratio * 100)}% ({comp.done}/{comp.expected})
                      {e.assignedByName && ` · de la ${e.assignedByName}`}
                    </p>
                  </div>
                  {canAssign && (
                    <div className="flex flex-col gap-1">
                      <button onClick={() => setEditing(e)} aria-label="Editează" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/8"><Pencil size={13} /></button>
                      <button onClick={() => void setActive(e, false)} aria-label="Arhivează" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/8"><Archive size={13} /></button>
                    </div>
                  )}
                </div>
                {/* This week's ticks */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-white/45">Săptămâna asta:</span>
                  <div className="flex gap-1" aria-label={`${done} din ${e.perWeek}`}>
                    {Array.from({ length: e.perWeek }, (_, i) => (
                      <span key={i} className={`w-3.5 h-3.5 rounded-full ${i < done ? 'bg-brand-green' : 'bg-white/10'}`} />
                    ))}
                  </div>
                  {isOwner && (
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => void tick(e, -1)} disabled={done === 0} aria-label="Anulează o bifă"
                        className="w-8 h-8 rounded-lg border border-white/15 text-white/60 flex items-center justify-center disabled:opacity-30"><Minus size={13} /></button>
                      <button onClick={() => void tick(e, 1)} disabled={done >= e.perWeek}
                        className="h-8 px-3 rounded-lg bg-brand-green text-black text-xs font-black flex items-center gap-1 disabled:opacity-40">
                        <Plus size={12} /> Făcut
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {archived.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/8">
          <button onClick={() => setShowArchived(v => !v)} className="text-xs text-white/40 font-bold">
            {showArchived ? 'Ascunde' : 'Arată'} arhivate ({archived.length})
          </button>
          {showArchived && archived.map(e => (
            <div key={e.id} className="flex items-center gap-2 mt-2 opacity-60">
              <p className="text-xs text-white/70 flex-1">{e.name} · {formatPrescription(e)}</p>
              {canAssign && (
                <>
                  <button onClick={() => void setActive(e, true)} aria-label="Reactivează" className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50"><ArchiveRestore size={12} /></button>
                  <button onClick={() => void remove(e)} aria-label="Șterge" className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/60"><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function ExerciseForm({ communityId, uid, coachUid, coachName, initial, onDone }: {
  communityId: string
  uid: string
  coachUid: string
  coachName: string
  initial: ExtraExercise | null
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [sets, setSets] = useState(initial?.sets ?? 3)
  const [amount, setAmount] = useState(initial?.amount ?? 10)
  const [unit, setUnit] = useState<ExerciseUnit>(initial?.unit ?? 'reps')
  const [perWeek, setPerWeek] = useState(initial?.perWeek ?? 3)
  const [deficiency, setDeficiency] = useState(initial?.deficiency ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const data = {
      name: name.trim().slice(0, 80),
      sets: Math.max(1, Math.min(20, sets)),
      amount: Math.max(1, Math.min(600, amount)),
      unit,
      perWeek: Math.max(1, Math.min(14, perWeek)),
      deficiency: deficiency.trim().slice(0, 120),
      notes: notes.trim().slice(0, 1000),
      assignedBy: coachUid,
      assignedByName: coachName,
      active: true,
      checks: initial?.checks ?? {},
      updatedAt: serverTimestamp(),
    }
    try {
      const col = collection(db, 'communities', communityId, 'memberPlans', uid, 'extraExercises')
      if (initial) await setDoc(doc(col, initial.id), data, { merge: true })
      else await addDoc(col, { ...data, createdAt: serverTimestamp() })
      onDone()
    } catch {
      showToast('Nu am putut salva exercițiul.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const num = (v: string) => Math.max(0, parseInt(v) || 0)
  return (
    <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-white/8">
      <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Exercițiu (ex: Scapula pull-ups)" className={fieldCls} />
      <div className="grid grid-cols-4 gap-2 items-end">
        <label className="flex flex-col gap-1"><span className="text-[11px] text-white/45">Seturi</span>
          <input inputMode="numeric" value={sets} onChange={e => setSets(num(e.target.value))} className={fieldCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-white/45">{unit === 'sec' ? 'Secunde' : 'Rep'}</span>
          <input inputMode="numeric" value={amount} onChange={e => setAmount(num(e.target.value))} className={fieldCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-white/45">Unitate</span>
          <select value={unit} onChange={e => setUnit(e.target.value as ExerciseUnit)} className={fieldCls}>
            <option value="reps">rep</option><option value="sec">sec</option>
          </select></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-white/45">× / săpt.</span>
          <input inputMode="numeric" value={perWeek} onChange={e => setPerWeek(num(e.target.value))} className={fieldCls} /></label>
      </div>
      <input value={deficiency} onChange={e => setDeficiency(e.target.value)} maxLength={120}
        placeholder="Ce carență acoperă (ex: scapula slabă la tracțiuni)" className={fieldCls} />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Note / execuție" className={areaCls} />
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
        <button onClick={() => void save()} disabled={saving || !name.trim()}
          className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">{saving ? '…' : 'Salvează'}</button>
      </div>
    </div>
  )
}
