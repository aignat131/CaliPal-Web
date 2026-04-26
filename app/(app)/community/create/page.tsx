'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  collection, addDoc, doc, setDoc, updateDoc,
  arrayUnion, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { ArrowLeft, MapPin, Loader } from 'lucide-react'

export default function CreateCommunityPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [lat, setLat] = useState(0)
  const [lng, setLng] = useState(0)
  const [locating, setLocating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  function detectLocation() {
    if (!navigator.geolocation) { setError('Geolocation nu este suportat.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
        setLocating(false)
      },
      () => { setError('Nu s-a putut determina locația.'); setLocating(false) }
    )
  }

  async function handleCreate() {
    if (!user || !name.trim()) return
    setCreating(true)
    setError('')
    try {
      const communityRef = await addDoc(collection(db, 'communities'), {
        name: name.trim(),
        description: description.trim(),
        location: location.trim(),
        latitude: lat,
        longitude: lng,
        creatorId: user.uid,
        creatorName: user.displayName ?? '',
        memberCount: 1,
        isPublic: true,
        imageUrl: '',
        createdAt: serverTimestamp(),
      })
      // Add creator as ADMIN member
      await setDoc(doc(db, 'communities', communityRef.id, 'members', user.uid), {
        userId: user.uid,
        displayName: user.displayName ?? '',
        role: 'ADMIN',
        level: 1,
        points: 0,
        photoUrl: user.photoURL ?? null,
        joinedAt: serverTimestamp(),
      })
      // Update user's joinedCommunityIds
      await updateDoc(doc(db, 'users', user.uid), {
        joinedCommunityIds: arrayUnion(communityRef.id),
      })
      router.replace(`/community/${communityRef.id}`)
    } catch {
      setError('A apărut o eroare. Încearcă din nou.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Crează Comunitate</h1>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="NUME COMUNITATE *" value={name} onChange={setName} placeholder="ex: Pull-Up Kings București" />
          <div>
            <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">DESCRIERE</p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Despre ce este această comunitate?"
              rows={3}
              className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors resize-none"
            />
          </div>

          <div>
            <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">LOCAȚIE</p>
            <div className="flex gap-2">
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="ex: Parcul Herăstrău"
                className="flex-1 h-[54px] rounded-[14px] px-4 text-[15px] text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
              />
              <button
                onClick={detectLocation}
                disabled={locating}
                className="w-14 h-[54px] rounded-[14px] border border-white/12 bg-white/7 flex items-center justify-center hover:bg-white/12 transition-colors disabled:opacity-50"
              >
                {locating ? <Loader size={16} className="text-brand-green animate-spin" /> : <MapPin size={16} className="text-brand-green" />}
              </button>
            </div>
            {lat !== 0 && <p className="text-[11px] text-brand-green mt-1">📍 Locație detectată</p>}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="w-full rounded-full font-extrabold text-[15px] text-white disabled:opacity-40 flex items-center justify-center mt-2"
            style={{ height: 52, backgroundColor: '#1DB954' }}
          >
            {creating
              ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Crează comunitatea →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div>
      <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">{label}</p>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-[54px] rounded-[14px] px-4 text-[15px] text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
      />
    </div>
  )
}
