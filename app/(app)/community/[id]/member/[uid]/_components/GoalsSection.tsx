'use client'

import { useEffect, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, type Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import { GOAL_SKILLS, type Goal } from '@/lib/schedule/goals'
import { callApi, apiErrorMessage } from '@/lib/schedule/client'
import { todayKey } from '@/lib/schedule/week'
import { Section, fieldCls } from './Section'
import { Target, Pencil, Trash2, Trophy, RotateCcw, Plus } from 'lucide-react'

function toGoal(id: string, x: Record<string, unknown>): Goal {
  return {
    id,
    skill: (x.skill as string) ?? '',
    currentLevel: (x.currentLevel as string) ?? '',
    target: (x.target as string) ?? '',
    deadline: (x.deadline as string) || null,
    status: x.status === 'ACHIEVED' ? 'ACHIEVED' : 'IN_PROGRESS',
    rewarded: x.rewarded === true,
    createdAtMs: (x.createdAt as Timestamp | undefined)?.toMillis?.() ?? null,
    achievedAtMs: (x.achievedAt as Timestamp | undefined)?.toMillis?.() ?? null,
  }
}

export function GoalsSection({ communityId, uid, isOwner, isCoach }: {
  communityId: string
  uid: string
  isOwner: boolean
  isCoach: boolean
}) {
  const { showToast } = useToast()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const col = collection(db, 'communities', communityId, 'memberPlans', uid, 'goals')

  useEffect(() => {
    return onSnapshot(collection(db, 'communities', communityId, 'memberPlans', uid, 'goals'), snap => {
      const list = snap.docs.map(d => toGoal(d.id, d.data()))
      list.sort((a, b) => (a.status === b.status ? (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0) : a.status === 'IN_PROGRESS' ? -1 : 1))
      setGoals(list)
    }, () => setGoals([]))
  }, [communityId, uid])

  async function achieve(g: Goal) {
    const res = await callApi(`/api/community/${communityId}/goals/${g.id}/achieve`, isOwner ? {} : { uid })
    if (!res.ok) { showToast(apiErrorMessage(res.reason), 'error'); return }
    showToast('🏆 Obiectiv atins!', 'success')
  }

  async function reopen(g: Goal) {
    try { await updateDoc(doc(col, g.id), { status: 'IN_PROGRESS', updatedAt: serverTimestamp() }) }
    catch { showToast('Nu am putut actualiza obiectivul.', 'error') }
  }

  async function remove(g: Goal) {
    if (!confirm(`Ștergi goal-ul „${g.skill}”?`)) return
    try { await deleteDoc(doc(col, g.id)) } catch { showToast('Nu am putut șterge.', 'error') }
  }

  return (
    <Section title="Obiective" icon={<Target size={11} />}
      action={isOwner && !editing ? (
        <button onClick={() => setEditing('new')} className="text-xs font-bold text-brand-green flex items-center gap-0.5">
          <Plus size={12} /> Adaugă
        </button>
      ) : undefined}>
      {editing && (
        <GoalForm communityId={communityId} uid={uid} initial={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)} />
      )}
      {goals === null ? (
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
      ) : goals.length === 0 && !editing ? (
        <p className="text-xs text-white/40">
          {isOwner ? 'Adaugă skill-urile pe care vrei să le înveți (muscle-up, front lever…) și urmărește-ți progresul.' : 'Niciun obiectiv setat încă.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-white/8">
          {goals.map(g => {
            const daysLeft = g.deadline ? Math.round((Date.parse(g.deadline) - Date.parse(todayKey())) / 86_400_000) : null
            const achieved = g.status === 'ACHIEVED'
            return (
              <div key={g.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white flex items-center gap-1.5">
                      {achieved && <Trophy size={13} className="text-[#E3B24C]" />}{g.skill}
                    </p>
                    <p className="text-[12px] text-white/55 mt-0.5">
                      {g.currentLevel ? <>Acum: <span className="text-white/80">{g.currentLevel}</span></> : 'Nivel actual nesetat'}
                      {g.target && <> → <span className="text-brand-green">{g.target}</span></>}
                    </p>
                    {g.deadline && !achieved && (
                      <p className={`text-[11px] mt-0.5 ${daysLeft !== null && daysLeft < 0 ? 'text-red-400' : 'text-white/40'}`}>
                        Termen: {g.deadline.split('-').reverse().join('.')}
                        {daysLeft !== null && (daysLeft < 0 ? ` · depășit cu ${-daysLeft} zile` : daysLeft === 0 ? ' · azi' : ` · ${daysLeft} zile rămase`)}
                      </p>
                    )}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${achieved ? 'bg-[#E3B24C]/15 text-[#E3B24C]' : 'bg-white/8 text-white/60'}`}>
                    {achieved ? 'Atins' : 'În lucru'}
                  </span>
                </div>
                {(isOwner || (isCoach && !achieved)) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {!achieved && (
                      <button onClick={() => void achieve(g)}
                        className="h-8 px-3 rounded-lg bg-brand-green text-black text-xs font-black flex items-center gap-1">
                        <Trophy size={12} /> {isOwner ? 'L-am atins!' : 'Marchează atins'}
                      </button>
                    )}
                    {isOwner && achieved && (
                      <button onClick={() => void reopen(g)} className="h-8 px-2.5 rounded-lg border border-white/15 text-white/60 text-xs font-bold flex items-center gap-1">
                        <RotateCcw size={12} /> Redeschide
                      </button>
                    )}
                    {isOwner && (
                      <>
                        <button onClick={() => setEditing(g)} aria-label="Editează" className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/8"><Pencil size={13} /></button>
                        <button onClick={() => void remove(g)} aria-label="Șterge" className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400/60 hover:bg-red-500/10"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

function GoalForm({ communityId, uid, initial, onDone }: {
  communityId: string
  uid: string
  initial: Goal | null
  onDone: () => void
}) {
  const { showToast } = useToast()
  const isPreset = (s: string) => (GOAL_SKILLS as readonly string[]).includes(s)
  const [skill, setSkill] = useState(initial ? (isPreset(initial.skill) ? initial.skill : 'custom') : 'Muscle-up')
  const [custom, setCustom] = useState(initial && !isPreset(initial.skill) ? initial.skill : '')
  const [currentLevel, setCurrentLevel] = useState(initial?.currentLevel ?? '')
  const [target, setTarget] = useState(initial?.target ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [saving, setSaving] = useState(false)
  const finalSkill = (skill === 'custom' ? custom : skill).trim()

  async function save() {
    if (!finalSkill) return
    setSaving(true)
    const data = {
      skill: finalSkill.slice(0, 60),
      currentLevel: currentLevel.trim().slice(0, 120),
      target: target.trim().slice(0, 120),
      deadline: deadline || null,
      updatedAt: serverTimestamp(),
    }
    try {
      const col = collection(db, 'communities', communityId, 'memberPlans', uid, 'goals')
      if (initial) await updateDoc(doc(col, initial.id), data)
      else await addDoc(col, { ...data, status: 'IN_PROGRESS', createdAt: serverTimestamp() })
      onDone()
    } catch {
      showToast('Nu am putut salva obiectivul.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-white/8">
      <select value={skill} onChange={e => setSkill(e.target.value)} className={fieldCls} aria-label="Skill">
        {GOAL_SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
        <option value="custom">Altul…</option>
      </select>
      {skill === 'custom' && (
        <input value={custom} onChange={e => setCustom(e.target.value)} maxLength={60} placeholder="Numele skill-ului" className={fieldCls} />
      )}
      <input value={currentLevel} onChange={e => setCurrentLevel(e.target.value)} maxLength={120}
        placeholder="Nivel actual (ex: tuck 8 sec)" className={fieldCls} />
      <input value={target} onChange={e => setTarget(e.target.value)} maxLength={120}
        placeholder="Obiectiv (ex: straddle 5 sec)" className={fieldCls} />
      <label className="flex items-center gap-2">
        <span className="text-xs text-white/45 flex-shrink-0">Termen</span>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={fieldCls} />
      </label>
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
        <button onClick={() => void save()} disabled={saving || !finalSkill}
          className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">{saving ? '…' : 'Salvează'}</button>
      </div>
    </div>
  )
}
