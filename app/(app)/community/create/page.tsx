'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import {
  collection, addDoc, doc, setDoc, updateDoc,
  arrayUnion, serverTimestamp, getDocs, query, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { uploadCommunityPhoto } from '@/lib/firebase/storage'
import { useAuth } from '@/lib/hooks/useAuth'
import type { ParkDoc } from '@/types'
import { ArrowLeft, Camera, Search, MapPin, Map, HelpCircle, Check, X, Loader } from 'lucide-react'

const MapPickerInner = nextDynamic(() => import('@/components/map/MapPickerInner'), { ssr: false })

async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; address: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'ro' } }
    )
    const data = await res.json()
    const addr = data.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? ''
    const address = data.display_name ?? ''
    return { city, address }
  } catch {
    return { city: '', address: '' }
  }
}

export default function CreateCommunityPage() {
  const { user } = useAuth()
  const router = useRouter()

  // Form fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPark, setSelectedPark] = useState<ParkDoc | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Photo
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // City & parks detection
  const [detectingCity, setDetectingCity] = useState(true)
  const [detectedCity, setDetectedCity] = useState('')
  const [parks, setParks] = useState<ParkDoc[]>([])
  const [parkSearch, setParkSearch] = useState('')

  // Map picker modal
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [mapLat, setMapLat] = useState<number | null>(null)
  const [mapLng, setMapLng] = useState<number | null>(null)
  const [mapAddress, setMapAddress] = useState('')
  const [geocodingMap, setGeocodingMap] = useState(false)

  // Park request form
  const [showParkRequest, setShowParkRequest] = useState(false)
  const [reqName, setReqName] = useState('')
  const [reqAddress, setReqAddress] = useState('')
  const [reqCity, setReqCity] = useState('')
  const [reqDesc, setReqDesc] = useState('')
  const [reqSending, setReqSending] = useState(false)
  const [reqSent, setReqSent] = useState(false)

  // Detect city on mount
  useEffect(() => {
    if (!navigator.geolocation) { setDetectingCity(false); return }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { city } = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        setDetectedCity(city)
        setDetectingCity(false)
      },
      () => { setDetectingCity(false) }
    )
  }, [])

  // Load parks when city detected
  useEffect(() => {
    if (!detectedCity) return
    getDocs(query(collection(db, 'parks'), where('city', '==', detectedCity))).then(snap => {
      setParks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkDoc))
    })
  }, [detectedCity])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleMapPick(lat: number, lng: number) {
    setMapLat(lat)
    setMapLng(lng)
    setGeocodingMap(true)
    const { address } = await reverseGeocode(lat, lng)
    setMapAddress(address)
    setGeocodingMap(false)
  }

  function confirmMapPick() {
    if (!mapLat || !mapLng) return
    // Create a synthetic park-like selection from map
    setSelectedPark({
      id: '__map__',
      name: mapAddress || `${mapLat.toFixed(4)}, ${mapLng.toFixed(4)}`,
      address: mapAddress,
      city: detectedCity,
      description: '',
      latitude: mapLat,
      longitude: mapLng,
      communityId: null,
      placeId: '',
      addedByUid: '',
      createdAt: null,
    })
    setShowMapPicker(false)
  }

  async function submitParkRequest() {
    if (!user || !reqName.trim()) return
    setReqSending(true)
    try {
      await addDoc(collection(db, 'park_requests'), {
        name: reqName.trim(),
        address: reqAddress.trim(),
        city: reqCity.trim() || detectedCity,
        description: reqDesc.trim(),
        latitude: 0,
        longitude: 0,
        requestedByUid: user.uid,
        status: 'NEW',
        createdAt: serverTimestamp(),
      })
      setReqSent(true)
    } finally {
      setReqSending(false)
    }
  }

  async function handleCreate() {
    if (!user || !name.trim() || !selectedPark) return
    setCreating(true)
    setError('')
    try {
      const communityRef = await addDoc(collection(db, 'communities'), {
        name: name.trim(),
        description: description.trim(),
        location: selectedPark.name,
        latitude: selectedPark.latitude,
        longitude: selectedPark.longitude,
        creatorId: user.uid,
        creatorName: user.displayName ?? '',
        memberCount: 1,
        isPublic: true,
        imageUrl: '',
        createdAt: serverTimestamp(),
      })

      // Upload photo if selected
      let imageUrl = ''
      if (pendingFile) {
        imageUrl = await uploadCommunityPhoto(communityRef.id, pendingFile)
        await updateDoc(communityRef, { imageUrl })
      }

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

  const filteredParks = parks.filter(p =>
    p.name.toLowerCase().includes(parkSearch.toLowerCase())
  )

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Map Picker Modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-[500] flex flex-col bg-black/80">
          <div className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: 'var(--app-bg)' }}>
            <p className="text-sm font-bold text-white">Alege locația de pe hartă</p>
            <button onClick={() => setShowMapPicker(false)} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
              <X size={15} className="text-white/60" />
            </button>
          </div>
          <div className="flex-1 relative">
            <MapPickerInner lat={mapLat} lng={mapLng} onPick={handleMapPick} />
          </div>
          <div className="px-4 py-4" style={{ backgroundColor: 'var(--app-bg)' }}>
            {geocodingMap && <p className="text-xs text-white/40 mb-2 text-center">Se determină adresa...</p>}
            {mapAddress && !geocodingMap && (
              <p className="text-xs text-white/60 mb-2 text-center line-clamp-2">{mapAddress}</p>
            )}
            {!mapLat && <p className="text-xs text-white/35 mb-2 text-center">Apasă pe hartă pentru a selecta locația</p>}
            <button
              onClick={confirmMapPick}
              disabled={!mapLat || geocodingMap}
              className="w-full h-11 rounded-2xl bg-brand-green text-black font-black text-sm disabled:opacity-40"
            >
              Confirmă locația
            </button>
          </div>
        </div>
      )}

      {/* Park Request Modal */}
      {showParkRequest && (
        <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70"
          onClick={() => !reqSent && setShowParkRequest(false)}>
          <div
            className="w-full max-w-sm rounded-t-3xl p-5 pb-8"
            style={{ backgroundColor: 'var(--app-surface)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-black text-white text-sm">Solicită adăugarea unui parc</p>
              <button onClick={() => setShowParkRequest(false)} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
                <X size={13} className="text-white/50" />
              </button>
            </div>
            {reqSent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-brand-green/20 flex items-center justify-center">
                  <Check size={22} className="text-brand-green" />
                </div>
                <p className="font-black text-white">Cerere trimisă!</p>
                <p className="text-xs text-white/50">Vei fi notificat când parcul este adăugat.</p>
                <button
                  onClick={() => { setShowParkRequest(false); setReqSent(false) }}
                  className="mt-2 h-10 px-6 rounded-xl bg-brand-green text-black font-bold text-sm"
                >
                  Închide
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input value={reqName} onChange={e => setReqName(e.target.value)} placeholder="Numele parcului *"
                  className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
                <input value={reqAddress} onChange={e => setReqAddress(e.target.value)} placeholder="Adresa"
                  className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
                <input
                  value={reqCity}
                  onChange={e => setReqCity(e.target.value)}
                  placeholder={detectedCity ? `Oraș (${detectedCity})` : 'Oraș'}
                  className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
                />
                <textarea value={reqDesc} onChange={e => setReqDesc(e.target.value)} placeholder="Descriere (opțional)"
                  rows={2} className="rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 resize-none" />
                <button
                  onClick={submitParkRequest}
                  disabled={reqSending || !reqName.trim()}
                  className="w-full h-11 rounded-2xl bg-brand-green text-black font-black text-sm disabled:opacity-40 mt-1"
                >
                  {reqSending ? '...' : 'Trimite cererea'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Crează Comunitate</h1>
        </div>

        <div className="flex flex-col gap-5">

          {/* Photo picker */}
          <div className="flex flex-col items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center relative border-2 border-dashed border-white/20 hover:border-brand-green/50 transition-colors"
              style={{ backgroundColor: '#1ED75F10' }}
            >
              {previewUrl
                ? <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                : <Camera size={28} className="text-white/30" />
              }
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Camera size={20} className="text-white" />
              </div>
            </button>
            <p className="text-xs text-white/35">Adaugă o fotografie</p>
          </div>

          {/* Name */}
          <Field label="NUME COMUNITATE *" value={name} onChange={setName} placeholder="ex: Pull-Up Kings București" />

          {/* Description */}
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

          {/* Park selection */}
          <div>
            <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-2">PARC / LOCAȚIE *</p>

            {selectedPark ? (
              /* Selected park display */
              <div className="rounded-[14px] px-4 py-3 border border-brand-green/40 flex items-center gap-3"
                style={{ backgroundColor: '#1ED75F08' }}>
                <MapPin size={16} className="text-brand-green flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{selectedPark.name}</p>
                  {selectedPark.address && (
                    <p className="text-xs text-white/40 truncate">{selectedPark.address}</p>
                  )}
                </div>
                <button onClick={() => setSelectedPark(null)}
                  className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
                  <X size={13} className="text-white/50" />
                </button>
              </div>
            ) : detectingCity ? (
              /* Detecting city */
              <div className="rounded-[14px] px-4 py-4 border border-white/12 flex items-center gap-2"
                style={{ backgroundColor: 'var(--app-surface)' }}>
                <Loader size={14} className="text-brand-green animate-spin" />
                <p className="text-sm text-white/40">Detectăm orașul tău...</p>
              </div>
            ) : (
              /* Park list */
              <div className="flex flex-col gap-2">
                {detectedCity && (
                  <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
                    <MapPin size={11} className="text-brand-green" />
                    <span>Parcuri în <span className="text-white/70 font-semibold">{detectedCity}</span></span>
                  </div>
                )}

                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    value={parkSearch}
                    onChange={e => setParkSearch(e.target.value)}
                    placeholder="Caută parc..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50"
                  />
                </div>

                {/* Park list */}
                {filteredParks.length > 0 ? (
                  <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                    {filteredParks.map(park => (
                      <button
                        key={park.id}
                        onClick={() => setSelectedPark(park)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/8 transition-colors border border-transparent hover:border-white/10"
                      >
                        <MapPin size={14} className="text-white/30 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{park.name}</p>
                          {park.address && <p className="text-xs text-white/35 truncate">{park.address}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/35 text-center py-3">
                    {detectedCity
                      ? `Niciun parc găsit în ${detectedCity}.`
                      : 'Nu s-a putut detecta orașul. Folosiți harta.'}
                  </p>
                )}

                {/* Map + Park request buttons */}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setShowMapPicker(true)}
                    className="flex-1 h-10 rounded-xl border border-white/15 text-xs font-semibold text-white/60 hover:bg-white/8 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Map size={13} /> Alege de pe hartă
                  </button>
                  <button
                    onClick={() => setShowParkRequest(true)}
                    className="flex-1 h-10 rounded-xl border border-white/15 text-xs font-semibold text-white/60 hover:bg-white/8 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <HelpCircle size={13} /> Nu găsesc parcul
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating || !name.trim() || !selectedPark}
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
