'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { MapPin, X, Navigation, Map } from 'lucide-react'

const MapPickerInner = dynamic(() => import('./MapPickerInner'), { ssr: false })

interface Props {
  onClose: () => void
  defaultLat?: number
  defaultLng?: number
}

async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; city: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ro`,
      { headers: { 'Accept-Language': 'ro' } }
    )
    const data = await res.json()
    const a = data.address ?? {}
    const road = [a.road, a.house_number].filter(Boolean).join(' ')
    const city = a.city ?? a.town ?? a.municipality ?? a.county ?? ''
    return { address: road, city }
  } catch {
    return { address: '', city: '' }
  }
}

export default function ParkRequestModal({ onClose, defaultLat, defaultLng }: Props) {
  const { user } = useAuth()
  const { displayName } = useMyProfile()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState<number | null>(defaultLat ?? null)
  const [lng, setLng] = useState<number | null>(defaultLng ?? null)
  const [locating, setLocating] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handlePick(pickedLat: number, pickedLng: number) {
    setLat(pickedLat)
    setLng(pickedLng)
    setShowMapPicker(false)
    setGeocoding(true)
    const result = await reverseGeocode(pickedLat, pickedLng)
    if (result.address) setAddress(result.address)
    if (result.city) setCity(result.city)
    setGeocoding(false)
  }

  async function detectLocation() {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        setLat(latitude)
        setLng(longitude)
        setLocating(false)
        setGeocoding(true)
        const result = await reverseGeocode(latitude, longitude)
        if (result.address) setAddress(result.address)
        if (result.city) setCity(result.city)
        setGeocoding(false)
      },
      () => setLocating(false)
    )
  }

  async function submit() {
    if (!user || !name.trim() || lat === null || lng === null) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'park_requests'), {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        description: description.trim(),
        latitude: lat,
        longitude: lng,
        requestedByUid: user.uid,
        requestedByName: displayName || user.displayName || '',
        status: 'PENDING',
        createdAt: serverTimestamp(),
      })
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors"
  const hasLocation = lat !== null && lng !== null

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60 px-0">
      <div
        className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-brand-green" />
            <span className="font-black text-white text-sm">Solicită un parc</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X size={14} className="text-white/70" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#1ED75F22' }}>
              <MapPin size={28} className="text-brand-green" />
            </div>
            <p className="font-black text-white text-base">Cerere trimisă!</p>
            <p className="text-sm text-white/55 leading-relaxed">
              Cererea ta a fost trimisă administratorilor. Vei fi notificat când parcul este aprobat.
            </p>
            <button onClick={onClose} className="mt-2 h-11 px-6 rounded-xl bg-brand-green text-black text-sm font-bold">
              Închide
            </button>
          </div>
        ) : showMapPicker ? (
          <div>
            <p className="text-xs text-white/50 mb-2 text-center">Apasă pe hartă pentru a alege locația parcului</p>
            <div style={{ height: 300 }}>
              <MapPickerInner lat={lat} lng={lng} onPick={handlePick} />
            </div>
            <button
              onClick={() => setShowMapPicker(false)}
              className="w-full mt-3 h-10 rounded-xl border border-white/15 text-sm text-white/60"
            >
              Anulează
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Numele parcului *"
              className={inputCls}
            />

            {/* Location picker */}
            <div className="flex gap-2">
              <div className="flex-1 h-10 rounded-xl px-3 flex items-center border border-white/12 bg-white/7">
                {geocoding ? (
                  <span className="text-xs text-white/40 flex items-center gap-1.5">
                    <span className="w-3 h-3 border border-brand-green border-t-transparent rounded-full animate-spin inline-block" />
                    Se detectează adresa...
                  </span>
                ) : hasLocation ? (
                  <span className="text-xs text-brand-green">
                    📍 {lat!.toFixed(4)}, {lng!.toFixed(4)}
                  </span>
                ) : (
                  <span className="text-xs text-white/30">Locație nesetată</span>
                )}
              </div>
              <button
                onClick={() => setShowMapPicker(true)}
                title="Alege pe hartă"
                className="w-10 h-10 flex-shrink-0 rounded-xl border border-white/12 bg-white/7 flex items-center justify-center"
              >
                <Map size={14} className="text-brand-green" />
              </button>
              <button
                onClick={detectLocation}
                disabled={locating}
                title="Folosește locația mea"
                className="w-10 h-10 flex-shrink-0 rounded-xl border border-white/12 bg-white/7 flex items-center justify-center disabled:opacity-40"
              >
                <Navigation size={14} className="text-brand-green" />
              </button>
            </div>
            <p className="text-[11px] text-white/35 -mt-1 px-1">
              Apasă <Map size={10} className="inline" /> pentru hartă sau <Navigation size={10} className="inline" /> pentru locația curentă. Adresa se completează automat.
            </p>

            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Adresă (completată automat)"
              className={inputCls}
            />
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Oraș (completat automat)"
              className={inputCls}
            />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descriere (echipamente, acces, etc.)"
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors resize-none"
            />

            <div className="flex gap-2 mt-1">
              <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60">
                Anulează
              </button>
              <button
                onClick={submit}
                disabled={saving || !name.trim() || !hasLocation}
                className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40"
              >
                {saving ? '...' : 'Trimite cererea'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
