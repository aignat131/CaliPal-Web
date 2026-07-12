'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc,
  doc, query, orderBy, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { createNotification } from '@/lib/firebase/notifications'
import type { ParkDoc, CommunityDoc, ParkRequest } from '@/types'
import { Plus, Trash2, Pencil, Check, X, MapPin, ChevronDown, ChevronUp } from 'lucide-react'

export function ParksTab() {
  const [parks, setParks] = useState<ParkDoc[]>([])
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [parkRequests, setParkRequests] = useState<ParkRequest[]>([])
  const [showRequests, setShowRequests] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editPark, setEditPark] = useState<ParkDoc | null>(null)

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'parks'), snap => {
      setParks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkDoc)
        .sort((a, b) => (a.city || '').localeCompare(b.city || '', 'ro')))
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
    await createNotification(
      req.requestedByUid, 'PARK_CREATED',
      'Parc aprobat! 🎉',
      `Parcul "${req.name}" pe care l-ai solicitat a fost adăugat pe hartă.`,
      parkRef.id
    )
  }

  async function rejectParkRequest(id: string) {
    await deleteDoc(doc(db, 'park_requests', id))
  }

  return (
    <div>
      {/* Pending park requests */}
      {parkRequests.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4 border border-yellow-400/25" style={{ backgroundColor: 'var(--app-surface)' }}>
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
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/25" style={{ backgroundColor: 'var(--app-surface)' }}>
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
          className="w-full h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-[var(--app-bg)]">
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
