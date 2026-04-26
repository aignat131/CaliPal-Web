'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc,
  doc, query, orderBy, where, serverTimestamp, getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { ParkDoc, CommunityDoc, WeeklyChallenge, ParkRequest } from '@/types'
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, MapPin, Trophy, Users, Shield, ChevronDown, ChevronUp } from 'lucide-react'

const SUPERADMIN = 'aignat131@gmail.com'

type AdminTab = 'parks' | 'challenges' | 'communities'

export default function AdminPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<AdminTab>('parks')

  useEffect(() => {
    if (user && user.email !== SUPERADMIN) router.replace('/home')
  }, [user, router])

  if (!user || user.email !== SUPERADMIN) return null

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Admin Hub</h1>
            <p className="text-xs text-white/40">SuperAdmin: {user.email}</p>
          </div>
          <div className="ml-auto px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <Shield size={10} className="inline mr-1" />ADMIN
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-5">
          {([
            ['parks', 'Parcuri', <MapPin key="p" size={13} />],
            ['challenges', 'Provocări', <Trophy key="c" size={13} />],
            ['communities', 'Comunități', <Users key="u" size={13} />],
          ] as [AdminTab, string, React.ReactNode][]).map(([t, label, icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                tab === t ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/40'
              }`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {tab === 'parks' && <ParksTab />}
        {tab === 'challenges' && <ChallengesTab />}
        {tab === 'communities' && <CommunitiesTab />}
      </div>
    </div>
  )
}

// ── Parks Tab ─────────────────────────────────────────────────────────────────

function ParksTab() {
  const [parks, setParks] = useState<ParkDoc[]>([])
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [parkRequests, setParkRequests] = useState<ParkRequest[]>([])
  const [showRequests, setShowRequests] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editPark, setEditPark] = useState<ParkDoc | null>(null)

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'parks'), snap => {
      setParks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkDoc))
    })
    const u2 = onSnapshot(query(collection(db, 'communities'), orderBy('memberCount', 'desc')), snap => {
      setCommunities(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc))
    })
    const u3 = onSnapshot(
      query(collection(db, 'park_requests'), where('status', '==', 'PENDING'), orderBy('createdAt', 'desc')),
      snap => setParkRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkRequest))
    )
    return () => { u1(); u2(); u3() }
  }, [])

  async function deletePark(id: string) {
    if (!confirm('Ștergi parcul?')) return
    await deleteDoc(doc(db, 'parks', id))
  }

  async function approveParkRequest(req: ParkRequest) {
    const parkRef = doc(collection(db, 'parks'))
    await setDoc(parkRef, {
      name: req.name,
      address: req.address,
      city: req.city,
      description: req.description,
      latitude: req.latitude,
      longitude: req.longitude,
      communityId: null,
      placeId: '',
      addedByUid: req.requestedByUid,
      createdAt: serverTimestamp(),
    })
    await deleteDoc(doc(db, 'park_requests', req.id))
  }

  async function rejectParkRequest(id: string) {
    await deleteDoc(doc(db, 'park_requests', id))
  }

  return (
    <div>
      {/* Pending park requests */}
      {parkRequests.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4 border border-yellow-400/25" style={{ backgroundColor: '#1a3010' }}>
          <button
            onClick={() => setShowRequests(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-yellow-400 tracking-widest">CERERI PARCURI</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-400/20 text-yellow-400">
                {parkRequests.length}
              </span>
            </div>
            {showRequests
              ? <ChevronUp size={14} className="text-yellow-400/60" />
              : <ChevronDown size={14} className="text-yellow-400/60" />}
          </button>

          {showRequests && (
            <div className="flex flex-col divide-y divide-white/6 border-t border-white/8">
              {parkRequests.map(req => (
                <div key={req.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{req.name}</p>
                      <p className="text-xs text-white/45 mt-0.5">
                        {req.city || req.address || `${req.latitude.toFixed(4)}, ${req.longitude.toFixed(4)}`}
                      </p>
                      <p className="text-[11px] text-white/35 mt-0.5">de {req.requestedByName}</p>
                      {req.description ? (
                        <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{req.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => rejectParkRequest(req.id)}
                      className="flex-1 h-8 rounded-xl border border-red-500/40 text-xs font-bold text-red-400 flex items-center justify-center gap-1"
                    >
                      <X size={12} /> Respinge
                    </button>
                    <button
                      onClick={() => approveParkRequest(req)}
                      className="flex-1 h-8 rounded-xl bg-brand-green text-black text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Check size={12} /> Aprobă
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={() => { setEditPark(null); setShowForm(true) }}
        className="w-full h-11 rounded-xl mb-4 border border-brand-green/40 text-brand-green text-sm font-bold flex items-center justify-center gap-2">
        <Plus size={15} /> Adaugă parc
      </button>

      {showForm && (
        <ParkForm
          park={editPark}
          communities={communities}
          onClose={() => { setShowForm(false); setEditPark(null) }}
        />
      )}

      <div className="flex flex-col gap-2">
        {parks.map(p => (
          <div key={p.id} className="rounded-2xl p-3.5" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                <p className="text-xs text-white/40">{p.city || p.address || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}</p>
                {p.communityId && (
                  <p className="text-[10px] text-brand-green mt-0.5">
                    🔗 {communities.find(c => c.id === p.communityId)?.name ?? p.communityId}
                  </p>
                )}
              </div>
              <button onClick={() => { setEditPark(p); setShowForm(true) }}
                className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
                <Pencil size={11} className="text-white/60" />
              </button>
              <button onClick={() => deletePark(p.id)}
                className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 size={11} className="text-red-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ParkForm({ park, communities, onClose }: {
  park: ParkDoc | null
  communities: CommunityDoc[]
  onClose: () => void
}) {
  const [name, setName] = useState(park?.name ?? '')
  const [address, setAddress] = useState(park?.address ?? '')
  const [city, setCity] = useState(park?.city ?? '')
  const [description, setDescription] = useState(park?.description ?? '')
  const [lat, setLat] = useState(String(park?.latitude ?? ''))
  const [lng, setLng] = useState(String(park?.longitude ?? ''))
  const [communityId, setCommunityId] = useState(park?.communityId ?? '')
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)

  function detectLocation() {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      () => setLocating(false)
    )
  }

  async function save() {
    if (!name.trim() || !lat || !lng) return
    setSaving(true)
    try {
      const data = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        description: description.trim(),
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        communityId: communityId || null,
        placeId: '',
        addedByUid: 'admin',
        createdAt: serverTimestamp(),
      }
      if (park) {
        await updateDoc(doc(db, 'parks', park.id), data)
      } else {
        await addDoc(collection(db, 'parks'), data)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50"

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/25" style={{ backgroundColor: '#1a3d38' }}>
      <p className="text-sm font-bold text-white mb-3">{park ? 'Editează parc' : 'Parc nou'}</p>
      <div className="flex flex-col gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nume *" className={inputCls} />
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Adresă" className={inputCls} />
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="Oraș" className={inputCls} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descriere" className={inputCls} />
        <div className="flex gap-2">
          <input value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitudine *" className={`${inputCls} flex-1`} />
          <input value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitudine *" className={`${inputCls} flex-1`} />
          <button onClick={detectLocation} disabled={locating}
            className="w-10 h-10 rounded-xl border border-white/12 bg-white/7 flex items-center justify-center flex-shrink-0">
            <MapPin size={14} className="text-brand-green" />
          </button>
        </div>
        <select value={communityId} onChange={e => setCommunityId(e.target.value)}
          className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[#0D2E2B]">
          <option value="">— Fără comunitate —</option>
          {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
          <button onClick={save} disabled={saving || !name.trim() || !lat || !lng}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Challenges Tab ────────────────────────────────────────────────────────────

function ChallengesTab() {
  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editChallenge, setEditChallenge] = useState<WeeklyChallenge | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'weekly_challenges'), orderBy('endsAt', 'desc')),
      snap => setChallenges(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WeeklyChallenge))
    )
    return unsub
  }, [])

  async function deleteChallenge(id: string) {
    if (!confirm('Ștergi provocarea?')) return
    await deleteDoc(doc(db, 'weekly_challenges', id))
  }

  return (
    <div>
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

      <div className="flex flex-col gap-2">
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
    </div>
  )
}

function ChallengeForm({ challenge, onClose }: { challenge: WeeklyChallenge | null; onClose: () => void }) {
  const [title, setTitle] = useState(challenge?.title ?? '')
  const [description, setDescription] = useState(challenge?.description ?? '')
  const [exerciseName, setExerciseName] = useState(challenge?.exerciseName ?? '')
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

  async function save() {
    if (!title.trim() || !exerciseName.trim()) return
    setSaving(true)
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        exerciseName: exerciseName.trim(),
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
    <div className="rounded-2xl p-4 mb-4 border border-yellow-400/25" style={{ backgroundColor: '#1a3d38' }}>
      <p className="text-sm font-bold text-white mb-3">{challenge ? 'Editează provocare' : 'Provocare nouă'}</p>
      <div className="flex flex-col gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titlu *" className={inputCls} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descriere" className={inputCls} />
        <input value={exerciseName} onChange={e => setExerciseName(e.target.value)} placeholder="Exercițiu (ex: Tracțiuni) *" className={inputCls} />
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
          <button onClick={save} disabled={saving || !title.trim() || !exerciseName.trim()}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Communities Tab ───────────────────────────────────────────────────────────

function CommunitiesTab() {
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [members, setMembers] = useState<Record<string, { userId: string; displayName: string; role: string }[]>>({})

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'communities'), orderBy('memberCount', 'desc')),
      snap => setCommunities(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc))
    )
    return unsub
  }, [])

  async function loadMembers(communityId: string) {
    if (members[communityId]) { setExpandedId(expandedId === communityId ? null : communityId); return }
    const snap = await getDocs(collection(db, 'communities', communityId, 'members'))
    setMembers(prev => ({
      ...prev,
      [communityId]: snap.docs.map(d => d.data() as { userId: string; displayName: string; role: string }),
    }))
    setExpandedId(communityId)
  }

  async function changeRole(communityId: string, userId: string, role: string) {
    await updateDoc(doc(db, 'communities', communityId, 'members', userId), { role })
    setMembers(prev => ({
      ...prev,
      [communityId]: prev[communityId]?.map(m => m.userId === userId ? { ...m, role } : m) ?? [],
    }))
  }

  const ROLES = ['ADMIN', 'MODERATOR', 'TRAINER', 'MEMBER']

  return (
    <div className="flex flex-col gap-2">
      {communities.map(c => (
        <div key={c.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
          <button onClick={() => loadMembers(c.id)} className="w-full flex items-center gap-3 p-3.5 text-left">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#1ED75F22' }}>
              <span className="font-black text-brand-green text-sm">{c.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{c.name}</p>
              <p className="text-xs text-white/40">{c.memberCount} membri</p>
            </div>
            <span className="text-white/30 text-xs">{expandedId === c.id ? '▲' : '▼'}</span>
          </button>

          {expandedId === c.id && members[c.id] && (
            <div className="border-t border-white/8 px-3 pb-3">
              {members[c.id].map(m => (
                <div key={m.userId} className="flex items-center gap-2 py-2">
                  <p className="text-xs text-white/70 flex-1 truncate">{m.displayName}</p>
                  <select value={m.role} onChange={e => changeRole(c.id, m.userId, e.target.value)}
                    className="text-xs text-white bg-transparent border border-white/20 rounded-lg px-2 py-1 outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
