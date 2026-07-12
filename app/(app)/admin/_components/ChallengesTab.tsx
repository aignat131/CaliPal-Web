'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp, getDocs, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { CommunityDoc, WeeklyChallenge, CommunityChallenge } from '@/types'
import { Plus, Trash2, Pencil, X } from 'lucide-react'

const EXERCISES = [
  'Tracțiuni', 'Flotări', 'Genuflexiuni', 'Dips', 'Muscle-up',
  'L-sit', 'Planche lean', 'Front lever', 'Back lever',
  'Dragon flag', 'Human flag', 'Burpees', 'Abdomene', 'Pistol squat',
  'Altul...',
]

export function ChallengesTab() {
  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editChallenge, setEditChallenge] = useState<WeeklyChallenge | null>(null)

  // Community challenges
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [commChallenges, setCommChallenges] = useState<(CommunityChallenge & { communityName: string })[]>([])
  const [showCommForm, setShowCommForm] = useState(false)

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, 'weekly_challenges'), orderBy('endsAt', 'desc')),
      snap => setChallenges(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WeeklyChallenge))
    )
    const u2 = onSnapshot(collection(db, 'communities'), snap => {
      const comms = snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc)
      setCommunities(comms)
      // Load all community challenges
      const commMap = new Map(comms.map(c => [c.id, c.name]))
      Promise.all(
        comms.map(c =>
          getDocs(query(collection(db, 'communities', c.id, 'challenges'), orderBy('endsAt', 'desc')))
            .then(s => s.docs.map(d => ({ id: d.id, ...d.data(), communityName: commMap.get(c.id) ?? '' } as CommunityChallenge & { communityName: string })))
            .catch(() => [] as (CommunityChallenge & { communityName: string })[])
        )
      ).then(results => setCommChallenges(results.flat()))
    })
    return () => { u1(); u2() }
  }, [])

  async function deleteChallenge(id: string) {
    if (!confirm('Ștergi provocarea?')) return
    await deleteDoc(doc(db, 'weekly_challenges', id))
  }

  async function deleteCommChallenge(communityId: string, id: string) {
    if (!confirm('Ștergi provocarea comunității?')) return
    await deleteDoc(doc(db, 'communities', communityId, 'challenges', id))
    setCommChallenges(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div>
      {/* Weekly challenges */}
      <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">SĂPTĂMÂNALE</p>
      <button onClick={() => { setEditChallenge(null); setShowForm(true) }}
        className="w-full h-11 rounded-xl mb-4 border border-yellow-400/40 text-yellow-400 text-sm font-bold flex items-center justify-center gap-2">
        <Plus size={15} /> Provocare săptămânală nouă
      </button>

      {showForm && (
        <ChallengeForm
          challenge={editChallenge}
          onClose={() => { setShowForm(false); setEditChallenge(null) }}
        />
      )}

      <div className="flex flex-col gap-2 mb-6">
        {challenges.map(c => {
          const endDate = c.endsAt?.toDate?.()
          const isActive = endDate ? endDate > new Date() : false
          return (
            <div key={c.id} className="rounded-2xl p-3.5" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-white truncate">{c.title}</p>
                    {isActive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/20 text-brand-green">ACTIV</span>}
                  </div>
                  <p className="text-xs text-white/40">{c.targetReps}× {c.exerciseName} · 🪙 {c.coinsReward}</p>
                  {endDate && <p className="text-[10px] text-white/30 mt-0.5">Expiră: {endDate.toLocaleDateString('ro')}</p>}
                </div>
                <button onClick={() => { setEditChallenge(c); setShowForm(true) }}
                  className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
                  <Pencil size={11} className="text-white/60" />
                </button>
                <button onClick={() => deleteChallenge(c.id)}
                  className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Trash2 size={11} className="text-red-400" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Community challenges */}
      <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">COMUNITĂȚI</p>
      <button onClick={() => setShowCommForm(true)}
        className="w-full h-11 rounded-xl mb-4 border border-brand-green/40 text-brand-green text-sm font-bold flex items-center justify-center gap-2">
        <Plus size={15} /> Provocare comunitate nouă
      </button>

      {showCommForm && (
        <CommunityChallengeForm
          communities={communities}
          onClose={() => setShowCommForm(false)}
          onSaved={challenge => { setCommChallenges(prev => [challenge, ...prev]); setShowCommForm(false) }}
        />
      )}

      <div className="flex flex-col gap-2">
        {commChallenges.map(c => {
          const endDate = (c.endsAt as { toDate?: () => Date } | undefined)?.toDate?.()
          const isActive = endDate ? endDate > new Date() : false
          return (
            <div key={c.id} className="rounded-2xl p-3.5" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-brand-green/70 tracking-widest mb-0.5">{c.communityName.toUpperCase()}</p>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-white truncate">{c.title}</p>
                    {isActive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/20 text-brand-green">ACTIV</span>}
                  </div>
                  <p className="text-xs text-white/40">{c.targetReps}× {c.exerciseName} · 🪙 {c.coinsReward}</p>
                  {endDate && <p className="text-[10px] text-white/30 mt-0.5">Expiră: {endDate.toLocaleDateString('ro')}</p>}
                </div>
                <button onClick={() => deleteCommChallenge(c.communityId, c.id)}
                  className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Trash2 size={11} className="text-red-400" />
                </button>
              </div>
            </div>
          )
        })}
        {commChallenges.length === 0 && (
          <p className="text-xs text-white/30 text-center py-4">Nicio provocare de comunitate.</p>
        )}
      </div>
    </div>
  )
}

function CommunityChallengeForm({
  communities, onClose, onSaved,
}: {
  communities: CommunityDoc[]
  onClose: () => void
  onSaved: (c: CommunityChallenge & { communityName: string }) => void
}) {
  const defaultEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const [selectedCommunity, setSelectedCommunity] = useState(communities[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [exerciseName, setExerciseName] = useState('')
  const [customExercise, setCustomExercise] = useState('')
  const [targetReps, setTargetReps] = useState('100')
  const [coinsReward, setCoinsReward] = useState('50')
  const [endsAt, setEndsAt] = useState(defaultEnd)
  const [saving, setSaving] = useState(false)

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50"
  const finalExercise = exerciseName === 'Altul...' ? customExercise.trim() : exerciseName

  async function save() {
    if (!title.trim() || !selectedCommunity) return
    setSaving(true)
    try {
      const ref = await addDoc(collection(db, 'communities', selectedCommunity, 'challenges'), {
        title: title.trim(),
        exerciseName: finalExercise,
        targetReps: parseInt(targetReps) || 100,
        coinsReward: parseInt(coinsReward) || 50,
        communityId: selectedCommunity,
        endsAt: Timestamp.fromDate(new Date(endsAt)),
        createdAt: serverTimestamp(),
      })
      const communityName = communities.find(c => c.id === selectedCommunity)?.name ?? ''
      onSaved({
        id: ref.id,
        title: title.trim(),
        exerciseName: finalExercise,
        targetReps: parseInt(targetReps) || 100,
        coinsReward: parseInt(coinsReward) || 50,
        communityId: selectedCommunity,
        endsAt: Timestamp.fromDate(new Date(endsAt)),
        createdAt: null,
        communityName,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/25" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-white">Provocare comunitate</p>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
          <X size={13} className="text-white/60" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <select value={selectedCommunity} onChange={e => setSelectedCommunity(e.target.value)}
          className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[var(--app-bg)]">
          {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titlu *" className={inputCls} />
        <select value={exerciseName} onChange={e => { setExerciseName(e.target.value); if (e.target.value !== 'Altul...') setCustomExercise('') }}
          className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[var(--app-bg)]">
          <option value="">— Fără exercițiu specific —</option>
          {EXERCISES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
        </select>
        {exerciseName === 'Altul...' && (
          <input value={customExercise} onChange={e => setCustomExercise(e.target.value)} placeholder="Numele exercițiului" className={inputCls} />
        )}
        <div className="flex gap-2">
          <input value={targetReps} onChange={e => setTargetReps(e.target.value)} placeholder="Repetări" className={`${inputCls} flex-1`} type="number" />
          <input value={coinsReward} onChange={e => setCoinsReward(e.target.value)} placeholder="Monede" className={`${inputCls} flex-1`} type="number" />
        </div>
        <input value={endsAt} onChange={e => setEndsAt(e.target.value)} type="date" className={inputCls} style={{ colorScheme: 'dark' }} />
        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
          <button onClick={save} disabled={saving || !title.trim() || !selectedCommunity}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChallengeForm({ challenge, onClose }: { challenge: WeeklyChallenge | null; onClose: () => void }) {
  const [title, setTitle] = useState(challenge?.title ?? '')
  const [description, setDescription] = useState(challenge?.description ?? '')
  const existingEx = challenge?.exerciseName ?? ''
  const isKnown = EXERCISES.includes(existingEx) || existingEx === ''
  const [exerciseName, setExerciseName] = useState(isKnown ? existingEx : 'Altul...')
  const [customExercise, setCustomExercise] = useState(isKnown ? '' : existingEx)
  const [targetReps, setTargetReps] = useState(String(challenge?.targetReps ?? '100'))
  const [coinsReward, setCoinsReward] = useState(String(challenge?.coinsReward ?? '50'))
  const [endsAt, setEndsAt] = useState(() => {
    if (challenge?.endsAt?.toDate) {
      return challenge.endsAt.toDate().toISOString().split('T')[0]
    }
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
  const [saving, setSaving] = useState(false)

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50"
  const finalExercise = exerciseName === 'Altul...' ? customExercise.trim() : exerciseName

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        exerciseName: finalExercise,
        targetReps: parseInt(targetReps) || 100,
        coinsReward: parseInt(coinsReward) || 50,
        endsAt: new Date(endsAt),
      }
      if (challenge) {
        await updateDoc(doc(db, 'weekly_challenges', challenge.id), data)
      } else {
        await addDoc(collection(db, 'weekly_challenges'), { ...data, createdAt: serverTimestamp() })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-yellow-400/25" style={{ backgroundColor: 'var(--app-surface)' }}>
      <p className="text-sm font-bold text-white mb-3">{challenge ? 'Editează provocare' : 'Provocare nouă'}</p>
      <div className="flex flex-col gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titlu *" className={inputCls} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descriere" className={inputCls} />
        <select value={exerciseName} onChange={e => { setExerciseName(e.target.value); if (e.target.value !== 'Altul...') setCustomExercise('') }}
          className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[var(--app-bg)]">
          <option value="">— Fără exercițiu specific —</option>
          {EXERCISES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
        </select>
        {exerciseName === 'Altul...' && (
          <input value={customExercise} onChange={e => setCustomExercise(e.target.value)} placeholder="Numele exercițiului" className={inputCls} />
        )}
        <div className="flex gap-2">
          <input value={targetReps} onChange={e => setTargetReps(e.target.value)} placeholder="Repetări țintă" className={`${inputCls} flex-1`} type="number" />
          <input value={coinsReward} onChange={e => setCoinsReward(e.target.value)} placeholder="Monede" className={`${inputCls} flex-1`} type="number" />
        </div>
        <div>
          <p className="text-[10px] text-white/40 mb-1">Data expirare</p>
          <input value={endsAt} onChange={e => setEndsAt(e.target.value)} type="date"
            className={inputCls} style={{ colorScheme: 'dark' }} />
        </div>
        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
          <button onClick={save} disabled={saving || !title.trim()}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}
