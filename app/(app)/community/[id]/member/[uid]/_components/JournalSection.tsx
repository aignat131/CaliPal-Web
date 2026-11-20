'use client'

import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useToast } from '@/lib/context/ToastContext'
import type { PlannedTraining } from '@/types'
import { journalRows, trainingDaysInWeek, type JournalEntry } from '@/lib/schedule/progress'
import { currentWeekStart, todayKey, trainingSlot, weekRangeLabel } from '@/lib/schedule/week'
import { Section, areaCls, fieldCls } from './Section'
import { BookOpen, Pencil } from 'lucide-react'

type Saved = Record<string, Omit<JournalEntry, 'week' | 'saved'>>

export function JournalSection({ communityId, uid, isOwner, trainings }: {
  communityId: string
  uid: string
  isOwner: boolean
  trainings: PlannedTraining[] | null
}) {
  const [saved, setSaved] = useState<Saved | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [workoutDays, setWorkoutDays] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)
  const week = currentWeekStart()

  useEffect(() => onSnapshot(collection(db, 'communities', communityId, 'memberPlans', uid, 'journal'), snap => {
    const out: Saved = {}
    snap.forEach(d => {
      const x = d.data()
      out[d.id] = {
        trainings: Number.isInteger(x.trainings) ? x.trainings : 0,
        worked: (x.worked as string) ?? '', progress: (x.progress as string) ?? '', notes: (x.notes as string) ?? '',
      }
    })
    setSaved(out)
  }, () => setSaved({})), [communityId, uid])

  // Days with a logged personal workout (for the suggested count) — owner only.
  useEffect(() => {
    if (!isOwner) return
    getDocs(query(collection(db, 'users', uid, 'workouts'), orderBy('createdAt', 'desc'), limit(120)))
      .then(snap => setWorkoutDays(snap.docs
        .map(d => (d.data().createdAt as Timestamp | undefined)?.toDate?.())
        .filter((d): d is Date => !!d)
        .map(d => todayKey(d))))
      .catch(() => setWorkoutDays([]))
  }, [isOwner, uid])

  const attendedDays = useMemo(() => (trainings ?? [])
    .filter(t => (t.attendedBy ?? []).includes(uid))
    .map(t => trainingSlot(t.timeStart)?.dateKey)
    .filter((d): d is string => !!d), [trainings, uid])

  const rows = saved ? journalRows(saved, week, showAll ? 26 : 6) : null
  const suggestion = (w: string) => trainingDaysInWeek([...workoutDays, ...attendedDays], w)

  return (
    <Section title="Jurnal săptămânal" icon={<BookOpen size={11} />}>
      {rows === null ? (
        <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
      ) : (
        <div className="flex flex-col divide-y divide-white/8">
          {rows.map(r => editing === r.week ? (
            <JournalForm key={r.week} communityId={communityId} uid={uid} entry={r}
              suggested={suggestion(r.week)} onDone={() => setEditing(null)} />
          ) : (
            <div key={r.week} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-white flex-1">
                  {r.week === week ? 'Săptămâna asta' : weekRangeLabel(r.week)}
                </p>
                <span className="text-[11px] text-white/45 tabular-nums">
                  {r.saved ? `${r.trainings} antrenamente` : `${suggestion(r.week)} detectate`}
                </span>
                {isOwner && (
                  <button onClick={() => setEditing(r.week)} aria-label="Completează săptămâna"
                    className={`h-7 rounded-lg flex items-center justify-center text-xs font-bold ${r.saved ? 'w-7 text-white/50 hover:bg-white/8' : 'px-2.5 bg-brand-green/15 text-brand-green'}`}>
                    {r.saved ? <Pencil size={12} /> : 'Completează'}
                  </button>
                )}
              </div>
              {r.saved ? (
                <div className="mt-1 flex flex-col gap-0.5 text-[12px]">
                  {r.worked && <p className="text-white/70"><span className="text-white/40">Lucrat: </span>{r.worked}</p>}
                  {r.progress && <p className="text-brand-green/90"><span className="text-white/40">Progres: </span>{r.progress}</p>}
                  {r.notes && <p className="text-white/55"><span className="text-white/40">Note: </span>{r.notes}</p>}
                </div>
              ) : (
                <p className="text-[11px] text-white/30 mt-0.5">Necompletat</p>
              )}
            </div>
          ))}
          <button onClick={() => setShowAll(v => !v)} className="pt-3 text-xs font-bold text-white/40 text-left">
            {showAll ? 'Arată mai puțin' : 'Arată mai multe săptămâni'}
          </button>
        </div>
      )}
    </Section>
  )
}

function JournalForm({ communityId, uid, entry, suggested, onDone }: {
  communityId: string
  uid: string
  entry: JournalEntry
  suggested: number
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [trainings, setTrainings] = useState(entry.saved ? entry.trainings : suggested)
  const [worked, setWorked] = useState(entry.worked)
  const [progress, setProgress] = useState(entry.progress)
  const [notes, setNotes] = useState(entry.notes)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await setDoc(doc(db, 'communities', communityId, 'memberPlans', uid, 'journal', entry.week), {
        trainings: Math.max(0, Math.min(21, trainings)),
        worked: worked.trim().slice(0, 1000),
        progress: progress.trim().slice(0, 1000),
        notes: notes.trim().slice(0, 1000),
        updatedAt: serverTimestamp(),
      })
      onDone()
    } catch {
      showToast('Nu am putut salva jurnalul.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-3 flex flex-col gap-2">
      <p className="text-xs font-bold text-white">{weekRangeLabel(entry.week)}</p>
      <label className="flex items-center gap-2">
        <span className="text-xs text-white/45 flex-1">Câte antrenamente ai făcut?</span>
        <input inputMode="numeric" value={trainings} onChange={e => setTrainings(Math.max(0, parseInt(e.target.value) || 0))}
          className={`${fieldCls} w-16 text-center`} />
      </label>
      {!entry.saved && suggested > 0 && (
        <p className="text-[11px] text-white/35 -mt-1">Am detectat {suggested} zile cu antrenament (workouts + prezențe).</p>
      )}
      <textarea value={worked} onChange={e => setWorked(e.target.value)} rows={2} maxLength={1000}
        placeholder="Ce ai lucrat? (ex: pull, front lever tuck, mobilitate)" className={areaCls} />
      <textarea value={progress} onChange={e => setProgress(e.target.value)} rows={2} maxLength={1000}
        placeholder="Progres / recorduri (ex: prima tracțiune cu 10 kg!)" className={areaCls} />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={1000}
        placeholder="Note (oboseală, dureri, ce vrei să schimbi)" className={areaCls} />
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
        <button onClick={() => void save()} disabled={saving}
          className="flex-1 h-10 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">{saving ? '…' : 'Salvează'}</button>
      </div>
    </div>
  )
}
