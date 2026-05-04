'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'
import Image from 'next/image'
import {
  collection, onSnapshot, doc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, query, where, addDoc, updateDoc, arrayUnion,
} from 'firebase/firestore'

// ── Training date parser (for map upcoming-filter) ────────────────────────────

function parseMapTrainingDate(t: PlannedTraining): Date | null {
  const str = t.timeStart
  if (!str) return null
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  if (t.date && /^\d{2}:\d{2}$/.test(str)) return new Date(`${t.date}T${str}`)
  try { return new Date(str) } catch { return null }
}
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useTheme } from '@/lib/hooks/useTheme'
import type { ParkDoc, ParkPresenceMember, CommunityDoc, LocationSharingMode, ParkCommunityRequest, PlannedTraining } from '@/types'
import { MapPin, X, Navigation, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import {
  MapContainer, TileLayer, Marker, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ParkRequestModal from '@/components/map/ParkRequestModal'

// ── Custom Leaflet icons ─────────────────────────────────────────────────────

function makeParkIcon(hasComm: boolean, activeCount: number) {
  const color = hasComm ? '#1ED75F' : '#6B7280'
  const ring = activeCount > 0
    ? `<circle cx="20" cy="20" r="16" fill="none" stroke="${color}" stroke-width="2" opacity="0.5" class="pulse-ring"/>`
    : ''
  const glowDefs = hasComm ? `
    <defs>
      <radialGradient id="g" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#2EF070"/>
        <stop offset="100%" stop-color="#1ED75F"/>
      </radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>` : ''
  const pinFill = hasComm ? 'url(#g)' : color
  const pinFilter = hasComm ? 'filter="url(#glow)"' : ''
  const strokeW = hasComm ? '2' : '1.5'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
      <style>
        .pulse-ring { animation: pulse 2s ease-out infinite; }
        @keyframes pulse {
          0% { r: 16; opacity: 0.5; }
          100% { r: 26; opacity: 0; }
        }
      </style>
      ${glowDefs}
      ${ring}
      <ellipse cx="20" cy="43" rx="5" ry="2.5" fill="rgba(0,0,0,0.25)"/>
      <path d="M20 4 C11 4 5 11 5 19 C5 29 20 43 20 43 C20 43 35 29 35 19 C35 11 29 4 20 4Z"
        fill="${pinFill}" stroke="white" stroke-width="${strokeW}" ${pinFilter}/>
      <circle cx="20" cy="19" r="6" fill="white" opacity="0.9"/>
      ${activeCount > 0
        ? `<text x="20" y="23" text-anchor="middle" font-size="8" font-weight="bold" fill="${color}">${activeCount}</text>`
        : ''}
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [40, 48],
    iconAnchor: [20, 48],
  })
}

function makeUserIcon(photoUrl: string, name: string) {
  const initial = name.charAt(0).toUpperCase()
  const inner = photoUrl
    ? `<image href="${photoUrl}" width="24" height="24" clip-path="url(#clip)"/>`
    : `<text x="12" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#1ED75F">${initial}</text>`
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <defs><clipPath id="clip"><circle cx="12" cy="12" r="12"/></clipPath></defs>
      <circle cx="16" cy="16" r="14" fill="#164742" stroke="#1ED75F" stroke-width="2"/>
      ${inner}
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

// ── Recenter button (must be inside MapContainer) ────────────────────────────

function RecenterButton({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  return (
    <button
      onClick={() => map.setView([lat, lng], 15)}
      className="absolute bottom-4 right-4 z-[1000] w-11 h-11 rounded-full shadow-lg flex items-center justify-center"
      style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.15)' }}
    >
      <Navigation size={18} className="text-brand-green" />
    </button>
  )
}

// ── Auto-centers map once when user location first becomes available ──────────

const MapCenterOnUser = memo(function MapCenterOnUser({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  const didCenter = useRef(false)
  useEffect(() => {
    if (!didCenter.current) {
      didCenter.current = true
      map.setView([lat, lng], 15)
    }
  }, [map, lat, lng])
  return null
})

// ── Fly to a searched location ────────────────────────────────────────────────

const FlyToMap = memo(function FlyToMap({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 14)
  }, [target, map])
  return null
})

// ── Types ─────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'community' | 'nocommunity'

type NominatimResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

// ── Location Permission Sheet ─────────────────────────────────────────────────

function LocationPermissionSheet({
  onAllow,
  onDeny,
  denied,
}: {
  onAllow: () => void
  onDeny: () => void
  denied: boolean
}) {
  const { theme } = useTheme()
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60 px-0">
      <div
        className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8 text-center"
        style={{
          backgroundColor: 'var(--app-surface)',
          boxShadow: theme === 'light' ? '0 -4px 32px rgba(0,0,0,0.12)' : '0 -4px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: '#1ED75F22' }}
        >
          <Navigation size={28} className="text-brand-green" />
        </div>
        <h2 className="text-base font-black text-white mb-1">
          {denied ? 'Locație blocată' : 'Accesează locația ta'}
        </h2>
        {denied ? (
          <>
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              Locația a fost blocată în browser. Pentru a o activa, deschide{' '}
              <strong className="text-white/80">Setări browser → Permisiuni site</strong>{' '}
              și permite accesul la locație pentru această pagină.
            </p>
            <button
              onClick={onDeny}
              className="w-full h-12 rounded-2xl text-sm font-bold border border-white/20 text-white/70"
            >
              Continuă fără locație
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              CaliPal folosește locația ta pentru a-ți arăta parcurile din apropiere și
              pentru a te marca ca prezent în parcul în care te antrenezi.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onAllow}
                className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-bold"
              >
                Permite accesul la locație
              </button>
              <button
                onClick={onDeny}
                className="w-full h-12 rounded-2xl text-sm font-semibold text-white/50"
              >
                Nu acum
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── City list for onboarding city picker ─────────────────────────────────────

const CITIES = [
  { name: 'București',    lat: 44.4268, lng: 26.1025 },
  { name: 'Cluj-Napoca',  lat: 46.7712, lng: 23.6236 },
  { name: 'Timișoara',    lat: 45.7489, lng: 21.2087 },
  { name: 'Iași',         lat: 47.1585, lng: 27.6014 },
  { name: 'Constanța',    lat: 44.1598, lng: 28.6348 },
  { name: 'Brașov',       lat: 45.6427, lng: 25.5887 },
  { name: 'Craiova',      lat: 44.3302, lng: 23.7949 },
  { name: 'Galați',       lat: 45.4353, lng: 28.0080 },
  { name: 'Ploiești',     lat: 44.9434, lng: 26.0225 },
  { name: 'Oradea',       lat: 47.0465, lng: 21.9189 },
  { name: 'Sibiu',        lat: 45.7983, lng: 24.1256 },
  { name: 'Bacău',        lat: 46.5675, lng: 26.9146 },
]

// ── Map onboarding sheet (first-time visitors) ────────────────────────────────

function MapOnboardingSheet({
  onLocationGranted,
  onCitySelected,
  onSkip,
}: {
  onLocationGranted: (lat: number, lng: number) => void
  onCitySelected: (lat: number, lng: number) => void
  onSkip: () => void
}) {
  const { theme } = useTheme()
  const [showCities, setShowCities] = useState(false)
  const [locating, setLocating] = useState(false)

  function handleUseLocation() {
    if (!navigator.geolocation) { setShowCities(true); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        onLocationGranted(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setLocating(false)
        setShowCities(true)
      },
      { timeout: 8000 }
    )
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div
        className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{
          backgroundColor: 'var(--app-surface)',
          boxShadow: theme === 'light' ? '0 -4px 32px rgba(0,0,0,0.12)' : '0 -4px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

        {/* Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: '#1ED75F18' }}
        >
          <MapPin size={26} className="text-brand-green" />
        </div>

        {/* Headline */}
        <h2 className="text-xl font-black text-white mb-1">
          Unde vrei să te antrenezi?
        </h2>
        <p className="text-sm text-white/50 leading-relaxed mb-5">
          Găsim parcurile și comunitățile din zona ta.
        </p>

        {/* Buttons */}
        {!showCities && (
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleUseLocation}
              disabled={locating}
              className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#1ED75F', color: '#111' }}
            >
              <Navigation size={16} />
              {locating ? 'Se detectează...' : 'Folosește locația mea'}
            </button>
            <button
              onClick={() => setShowCities(true)}
              className="w-full h-12 rounded-2xl font-semibold text-sm border text-white/70 transition-colors hover:text-white/90"
              style={{ borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'transparent' }}
            >
              Alege un oraș
            </button>
          </div>
        )}

        {/* City list */}
        {showCities && (
          <div>
            <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-3">
              Selectează orașul tău
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {CITIES.map(city => (
                <button
                  key={city.name}
                  onClick={() => onCitySelected(city.lat, city.lng)}
                  className="h-11 rounded-xl text-sm font-semibold text-white/80 text-left px-3 border transition-colors hover:border-brand-green/50 hover:text-white"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.1)',
                  }}
                >
                  {city.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCities(false)}
              className="mt-3 text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              ← Înapoi
            </button>
          </div>
        )}

        {/* Skip */}
        <button
          onClick={onSkip}
          className="mt-4 w-full text-center text-xs text-white/25 hover:text-white/45 transition-colors"
        >
          Explorează fără locație
        </button>
      </div>
    </div>
  )
}

// ── Callout coord helper (must live inside MapContainer) ──────────────────────

function CalloutCoordHelper({
  parks,
  userLat,
  userLng,
  onReady,
}: {
  parks: ParkDoc[]
  userLat: number
  userLng: number
  onReady: (x: number, y: number, park: ParkDoc) => void
}) {
  const map = useMap()
  const didFire = useRef(false)

  useEffect(() => {
    if (didFire.current) return
    const commParks = parks.filter(p => p.communityId)
    if (!commParks.length) return

    // Find the nearest community park to the user
    const nearest = commParks.reduce((a, b) =>
      Math.hypot(a.latitude - userLat, a.longitude - userLng) <
      Math.hypot(b.latitude - userLat, b.longitude - userLng) ? a : b
    )

    didFire.current = true
    map.flyTo([nearest.latitude, nearest.longitude], 15, { duration: 1.5 })

    setTimeout(() => {
      const pt = map.latLngToContainerPoint([nearest.latitude, nearest.longitude])
      onReady(pt.x, pt.y, nearest)
    }, 1800)
  }, [map, parks, userLat, userLng, onReady])

  return null
}

// ── Main Component ────────────────────────────────────────────────────────────

const LOCATION_CONSENT_KEY = 'calipal_location_consent'

export default function MapClient() {
  const { user } = useAuth()
  const { theme } = useTheme()

  const [parks, setParks] = useState<ParkDoc[]>([])
  const [presence, setPresence] = useState<Record<string, ParkPresenceMember[]>>({})
  const [selectedPark, setSelectedPark] = useState<ParkDoc | null>(null)
  const [parkCommunity, setParkCommunity] = useState<CommunityDoc | null>(null)
  const [parkPresenceMembers, setParkPresenceMembers] = useState<ParkPresenceMember[]>([])
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sharing, setSharing] = useState(false)
  const [liveLocations, setLiveLocations] = useState<Record<string, string>>({})
  const [showParkRequest, setShowParkRequest] = useState(false)
  const [locationSharingMode, setLocationSharingMode] = useState<LocationSharingMode>('EVERYWHERE')
  const [showParkCommModal, setShowParkCommModal] = useState(false)
  const [parkPendingReq, setParkPendingReq] = useState<ParkCommunityRequest | null>(null)
  const [parkTrainings, setParkTrainings] = useState<PlannedTraining[]>([])
  const [userAdminCommunities, setUserAdminCommunities] = useState<CommunityDoc[]>([])
  const watchIdRef = useRef<number | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // Permission sheet state
  const [showPermSheet, setShowPermSheet] = useState(false)
  const [permDenied, setPermDenied] = useState(false)

  // Onboarding state
  const [showMapIntro, setShowMapIntro] = useState(false)
  const [calloutData, setCalloutData] = useState<{ x: number; y: number; park: ParkDoc } | null>(null)
  const [calloutDismissed, setCalloutDismissed] = useState(false)

  // ── Geolocation callbacks (defined before effects that use them) ──────────

  const startSharing = useCallback(() => {
    if (!user || !navigator.geolocation || locationSharingMode === 'OFF') return
    setSharing(true)
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        setMyLat(latitude)
        setMyLng(longitude)
        setDoc(doc(db, 'live_locations', user.uid), {
          uid: user.uid,
          displayName: user.displayName ?? '',
          photoUrl: user.photoURL ?? '',
          latitude,
          longitude,
          updatedAt: serverTimestamp(),
        }).catch(() => {})
      },
      () => setSharing(false),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }, [user, locationSharingMode])

  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (user) deleteDoc(doc(db, 'live_locations', user.uid)).catch(() => {})
    setSharing(false)
  }, [user])

  // ── Permission handlers ───────────────────────────────────────────────────

  function handleLocationAllow() {
    setShowPermSheet(false)
    localStorage.setItem(LOCATION_CONSENT_KEY, 'granted')
    startSharing()
  }

  function handleLocationDeny() {
    setShowPermSheet(false)
    localStorage.setItem(LOCATION_CONSENT_KEY, 'denied')
  }

  // ── Onboarding handlers ───────────────────────────────────────────────────

  function dismissCallout() {
    setCalloutDismissed(true)
    localStorage.setItem('calipal_community_callout_done', '1')
  }

  function finishMapIntro() {
    localStorage.setItem('calipal_map_intro_done', '1')
    setShowMapIntro(false)
  }

  function handleIntroLocationGranted(lat: number, lng: number) {
    setMyLat(lat)
    setMyLng(lng)
    localStorage.setItem(LOCATION_CONSENT_KEY, 'granted')
    finishMapIntro()
  }

  function handleIntroCitySelected(lat: number, lng: number) {
    setFlyTarget([lat, lng])
    finishMapIntro()
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  // Read user's location sharing mode from Firestore
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      const mode = snap.data()?.locationSharingMode as LocationSharingMode | undefined
      if (mode) setLocationSharingMode(mode)
    })
    return unsub
  }, [user])

  // Stop sharing automatically when mode is set to OFF
  useEffect(() => {
    if (locationSharingMode === 'OFF' && sharing) {
      stopSharing()
    }
  }, [locationSharingMode, sharing, stopSharing])

  // Check location consent when user is ready
  useEffect(() => {
    if (!user) return
    const stored = localStorage.getItem(LOCATION_CONSENT_KEY)
    if (stored === 'granted') {
      startSharing()
    } else if (stored === 'denied') {
      // Don't prompt again
    } else {
      // Never answered — check browser permission state, then show sheet
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
          if (result.state === 'granted') {
            localStorage.setItem(LOCATION_CONSENT_KEY, 'granted')
            startSharing()
          } else if (result.state === 'denied') {
            setPermDenied(true)
            setShowPermSheet(true)
          } else {
            setShowPermSheet(true)
          }
        }).catch(() => setShowPermSheet(true))
      } else {
        setShowPermSheet(true)
      }
    }
  }, [user, startSharing])

  // Guest location: just get position once to center the map (no Firestore, browser native dialog)
  useEffect(() => {
    if (user) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        setMyLat(pos.coords.latitude)
        setMyLng(pos.coords.longitude)
      },
      () => {} // user denied — map stays on Romania default center
    )
  }, [user])

  // Load communities where the current user is ADMIN (from joinedCommunityIds + createdByUid for Android compat)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const uid = user.uid
    getDoc(doc(db, 'users', uid)).then(async snap => {
      const ids: string[] = snap.data()?.joinedCommunityIds ?? []
      const joinedResults = await Promise.all(
        ids.map(id => getDoc(doc(db, 'communities', id)).then(s => s.exists() ? { id: s.id, ...s.data() } as CommunityDoc : null))
      )
      // Also fetch communities created by this user (Android may not update joinedCommunityIds)
      const createdSnap = await getDocs(query(collection(db, 'communities'), where('creatorId', '==', uid)))
      const createdComms = createdSnap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc)
      // Merge and deduplicate
      const allComms = [...joinedResults.filter(Boolean) as CommunityDoc[]]
      for (const c of createdComms) {
        if (!allComms.find(x => x.id === c.id)) allComms.push(c)
      }
      // Filter to ADMIN role
      const adminComms: CommunityDoc[] = []
      await Promise.all(allComms.map(async c => {
        const mem = await getDoc(doc(db, 'communities', c.id, 'members', uid))
        if (mem.exists() && mem.data().role === 'ADMIN') adminComms.push(c)
      }))
      if (!cancelled) setUserAdminCommunities(adminComms)
    })
    return () => { cancelled = true }
  }, [user])

  // Load parks
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'parks'), snap => {
      setParks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkDoc))
    })
    return unsub
  }, [])

  // Sync fresh photoUrls from live_locations (auth required)
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(collection(db, 'live_locations'), snap => {
      const map: Record<string, string> = {}
      snap.docs.forEach(d => { map[d.id] = (d.data().photoUrl as string) ?? '' })
      setLiveLocations(map)
    })
    return unsub
  }, [user])

  // Load presence for all park communities (auth required)
  useEffect(() => {
    if (!user) return
    const communityIds = [...new Set(parks.map(p => p.communityId).filter(Boolean) as string[])]
    if (communityIds.length === 0) return
    const unsubs = communityIds.map(cid =>
      onSnapshot(collection(db, 'park_presence', cid, 'active_members'), snap => {
        setPresence(prev => ({
          ...prev,
          [cid]: snap.docs.map(d => d.data() as ParkPresenceMember),
        }))
      })
    )
    return () => unsubs.forEach(u => u())
  }, [user, parks])

  // Cleanup on unmount + page unload
  useEffect(() => {
    const handleUnload = () => {
      if (user) deleteDoc(doc(db, 'live_locations', user.uid)).catch(() => {})
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      stopSharing()
    }
  }, [user, stopSharing])

  // Park selection: load community doc + live presence + today's training + pending request
  useEffect(() => {
    if (!selectedPark) {
      setParkCommunity(null)
      setParkPresenceMembers([])
      setParkTrainings([])
      setParkPendingReq(null)
      return
    }
    if (!selectedPark.communityId) {
      setParkCommunity(null)
      setParkPresenceMembers([])
      setParkTrainings([])
      // Check for pending community request on this park (PENDING = associate existing, NEW = created from map)
      if (user) {
        getDocs(query(
          collection(db, 'park_community_requests'),
          where('parkId', '==', selectedPark.id),
          where('status', 'in', ['PENDING', 'NEW'])
        )).then(snap => {
          setParkPendingReq(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as ParkCommunityRequest)
        })
      }
      return
    }
    setParkPendingReq(null)
    getDoc(doc(db, 'communities', selectedPark.communityId)).then(snap => {
      if (snap.exists()) setParkCommunity({ id: snap.id, ...snap.data() } as CommunityDoc)
      else setParkCommunity(null)
    }).catch(() => setParkCommunity(null))
    // Load upcoming trainings (public read rule allows this for everyone)
    getDocs(collection(db, 'communities', selectedPark.communityId, 'trainings'))
      .then(snap => {
        const now = new Date()
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)
        const upcoming = all
          .filter(t => {
            const start = parseMapTrainingDate(t)
            return !start || start >= now
          })
          .sort((a, b) => (parseMapTrainingDate(a)?.getTime() ?? 0) - (parseMapTrainingDate(b)?.getTime() ?? 0))
          .slice(0, 3)
        setParkTrainings(upcoming)
      })
      .catch(() => setParkTrainings([]))
    const unsub = onSnapshot(
      collection(db, 'park_presence', selectedPark.communityId, 'active_members'),
      snap => setParkPresenceMembers(snap.docs.map(d => d.data() as ParkPresenceMember))
    )
    return unsub
  }, [selectedPark, user])

  // Show map intro sheet on first visit
  useEffect(() => {
    if (!localStorage.getItem('calipal_map_intro_done')) {
      setShowMapIntro(true)
    }
    if (localStorage.getItem('calipal_community_callout_done')) {
      setCalloutDismissed(true)
    }
  }, [])

  // Auto-dismiss callout after 6 seconds
  useEffect(() => {
    if (!calloutData || calloutDismissed) return
    const t = setTimeout(dismissCallout, 6000)
    return () => clearTimeout(t)
  }, [calloutData, calloutDismissed])

  // Filter + search
  const filteredParks = parks.filter(p => {
    if (filter === 'community' && !p.communityId) return false
    if (filter === 'nocommunity' && p.communityId) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.city?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const centerLat = myLat ?? 45.9432
  const centerLng = myLng ?? 24.9668

  return (
    <div ref={mapContainerRef} className="relative flex flex-col h-[calc(100vh-64px)] md:h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* First-visit onboarding sheet */}
      {showMapIntro && (
        <MapOnboardingSheet
          onLocationGranted={handleIntroLocationGranted}
          onCitySelected={handleIntroCitySelected}
          onSkip={finishMapIntro}
        />
      )}

      {/* Location permission sheet (auth users only) */}
      {showPermSheet && (
        <LocationPermissionSheet
          onAllow={handleLocationAllow}
          onDeny={handleLocationDeny}
          denied={permDenied}
        />
      )}
      {/* Search + filter chips */}
      <div className="absolute top-0 left-0 right-0 z-[1000] px-3 pt-3 pb-2 pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto">
          <div className="relative">
            <input
              value={search}
              onChange={e => {
                const q = e.target.value
                setSearch(q)
                setShowSuggestions(true)
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                if (q.trim().length > 2) {
                  searchDebounceRef.current = setTimeout(async () => {
                    try {
                      const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=ro`,
                        { headers: { 'Accept-Language': 'ro' } }
                      )
                      const data: NominatimResult[] = await res.json()
                      setSuggestions(data)
                    } catch { /* ignore network errors */ }
                  }, 350)
                } else {
                  setSuggestions([])
                }
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Caută parc sau oraș..."
              className="w-full h-10 rounded-xl px-4 text-sm outline-none backdrop-blur-sm focus:border-brand-green/50 transition-colors"
              style={{
                backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(13,46,43,0.92)',
                border: '1px solid rgba(128,128,128,0.25)',
                color: theme === 'light' ? '#0D1B1A' : '#fff',
              }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div
                className="absolute top-11 left-0 right-0 rounded-xl overflow-hidden shadow-xl z-10"
                style={{
                  backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.98)' : 'rgba(13,46,43,0.98)',
                  border: '1px solid rgba(128,128,128,0.2)',
                }}
              >
                {suggestions.map(s => (
                  <button
                    key={s.place_id}
                    onMouseDown={() => {
                      setFlyTarget([parseFloat(s.lat), parseFloat(s.lon)])
                      setSearch(s.display_name.split(',')[0])
                      setSuggestions([])
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm border-b last:border-b-0 hover:bg-brand-green/10 transition-colors"
                    style={{
                      borderColor: 'rgba(128,128,128,0.12)',
                      color: theme === 'light' ? '#0D1B1A' : '#fff',
                    }}
                  >
                    <span className="font-semibold">{s.display_name.split(',')[0]}</span>
                    <span className="text-xs opacity-50 ml-1">{s.display_name.split(',').slice(1, 3).join(',')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {([
              ['all', 'Toate'],
              ['community', 'Cu comunitate'],
              ['nocommunity', 'Fără comunitate'],
            ] as [Filter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-shrink-0 h-7 px-3 rounded-full text-xs font-semibold transition-colors ${
                  filter === f ? 'bg-brand-green text-black' : ''
                }`}
                style={filter !== f ? {
                  backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.88)' : 'rgba(22,71,66,0.9)',
                  color: theme === 'light' ? '#0D1B1A' : 'rgba(255,255,255,0.65)',
                  border: '1px solid rgba(128,128,128,0.2)',
                } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={7}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            key={theme}
            url={
              theme === 'light'
                ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            }
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          <FlyToMap target={flyTarget} />

          {filteredParks.map(park => {
            const activeCount = park.communityId
              ? (presence[park.communityId]?.length ?? 0)
              : 0
            return (
              <Marker
                key={park.id}
                position={[park.latitude, park.longitude]}
                icon={makeParkIcon(!!park.communityId, activeCount)}
                eventHandlers={{ click: () => setSelectedPark(park) }}
              />
            )
          })}

          {myLat !== null && myLng !== null && (
            <>
              <MapCenterOnUser lat={myLat} lng={myLng} />
              {user && (
                <Marker
                  position={[myLat, myLng]}
                  icon={makeUserIcon(user.photoURL ?? '', user.displayName ?? 'U')}
                />
              )}
              <RecenterButton lat={myLat} lng={myLng} />
            </>
          )}

          {/* Community callout helper — fires once after location known */}
          {myLat !== null && myLng !== null && !showMapIntro && !calloutDismissed && parks.length > 0 && (
            <CalloutCoordHelper
              parks={parks}
              userLat={myLat}
              userLng={myLng}
              onReady={(x, y, park) => setCalloutData({ x, y, park })}
            />
          )}
        </MapContainer>
      </div>

      {/* Community pin callout (one-time guided tooltip) */}
      {calloutData && !calloutDismissed && (
        <div
          className="absolute z-[2500] pointer-events-auto"
          style={{
            left: Math.max(8, Math.min(calloutData.x - 96, (mapContainerRef.current?.clientWidth ?? 360) - 208)),
            top: Math.max(60, calloutData.y - 140),
          }}
        >
          <div
            className="w-48 rounded-2xl p-3 shadow-2xl animate-pop-in cursor-pointer"
            style={{ background: '#164742', border: '1.5px solid rgba(30,215,95,0.35)' }}
            onClick={() => {
              setSelectedPark(calloutData.park)
              dismissCallout()
            }}
          >
            <div className="flex items-start justify-between gap-1 mb-1">
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: '#1ED75F' }}>
                Comunitate activă
              </span>
              <button
                onClick={e => { e.stopPropagation(); dismissCallout() }}
                className="text-white/30 hover:text-white/60 transition-colors text-xs leading-none mt-0.5"
              >
                ✕
              </button>
            </div>
            <p className="text-[12px] text-white/75 leading-snug">
              O echipă se adună regulat la acest parc. Dă tap să afli mai mult 💪
            </p>
          </div>
          {/* Arrow pointing down toward pin */}
          <div
            className="ml-[88px]"
            style={{
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '10px solid rgba(30,215,95,0.35)',
            }}
          />
        </div>
      )}

      {/* Location sharing FAB (authenticated only) */}
      {user && (locationSharingMode === 'OFF' ? (
        <div className="absolute bottom-4 left-4 z-[1000] h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg bg-white/10 border border-white/15 text-white/40">
          <Navigation size={14} />Locație oprită
        </div>
      ) : sharing ? (
        /* Active sharing indicator — no stop button */
        <div className="absolute bottom-4 left-4 z-[1000] h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg bg-brand-green/15 border border-brand-green/30 text-brand-green">
          <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
          {locationSharingMode === 'FRIENDS_ONLY' ? 'Distribuie (prieteni)' : 'Locație activă'}
        </div>
      ) : (
        <button
          onClick={() => {
            const stored = localStorage.getItem(LOCATION_CONSENT_KEY)
            if (stored === 'granted') {
              startSharing()
            } else {
              setPermDenied(false)
              setShowPermSheet(true)
            }
          }}
          className="absolute bottom-4 left-4 z-[1000] h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg bg-brand-green text-black"
        >
          <Navigation size={14} />{locationSharingMode === 'FRIENDS_ONLY' ? 'Distribuie (prieteni)' : 'Distribuie locația'}
        </button>
      ))}

      {/* Request a park button (authenticated only) */}
      {user && (
      <button
        onClick={() => setShowParkRequest(true)}
        className="absolute bottom-16 left-4 z-[1000] h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md"
        style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)' }}
      >
        <MapPin size={12} className="text-brand-green" /> Solicită un parc
      </button>
      )}

      {showParkRequest && (
        <ParkRequestModal
          onClose={() => setShowParkRequest(false)}
          defaultLat={myLat ?? undefined}
          defaultLng={myLng ?? undefined}
        />
      )}

      {/* Park bottom sheet */}
      {selectedPark && (
        <ParkBottomSheet
          park={selectedPark}
          community={parkCommunity}
          members={parkPresenceMembers}
          liveLocations={liveLocations}
          onClose={() => { setSelectedPark(null); setShowParkCommModal(false) }}
          uid={user?.uid ?? null}
          userName={user?.displayName ?? ''}
          parkTrainings={parkTrainings}
          parkPendingReq={parkPendingReq}
          userAdminCommunities={userAdminCommunities}
          showParkCommModal={showParkCommModal}
          setShowParkCommModal={setShowParkCommModal}
          onPendingReqSet={req => setParkPendingReq(req)}
          onCommunityCreated={comm => setParkCommunity(comm)}
        />
      )}
    </div>
  )
}

// ── Park Bottom Sheet ─────────────────────────────────────────────────────────

function ParkBottomSheet({
  park, community, members, liveLocations, onClose,
  uid, userName, parkTrainings, parkPendingReq, userAdminCommunities,
  showParkCommModal, setShowParkCommModal, onPendingReqSet, onCommunityCreated: _onCommunityCreated,
}: {
  park: ParkDoc
  community: CommunityDoc | null
  members: ParkPresenceMember[]
  liveLocations: Record<string, string>
  onClose: () => void
  uid: string | null
  userName: string
  parkTrainings: PlannedTraining[]
  parkPendingReq: ParkCommunityRequest | null
  userAdminCommunities: CommunityDoc[]
  showParkCommModal: boolean
  setShowParkCommModal: (v: boolean) => void
  onPendingReqSet: (req: ParkCommunityRequest) => void
  onCommunityCreated: (comm: CommunityDoc) => void
}) {
  const { theme } = useTheme()
  const [showCommChoice, setShowCommChoice] = useState(false)
  const [showCreateCommForm, setShowCreateCommForm] = useState(false)
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[2000] rounded-t-3xl px-4 pt-4 pb-6 max-h-[70vh] overflow-y-auto"
      style={{
        backgroundColor: 'var(--app-surface)',
        boxShadow: theme === 'light' ? '0 -4px 24px rgba(0,0,0,0.15)' : '0 -4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-white text-base leading-tight">{park.name}</h2>
          {park.address && (
            <p className="text-xs text-white/45 mt-0.5">
              {park.address}{park.city ? `, ${park.city}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${park.latitude},${park.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            title="Direcții Google Maps"
          >
            <Navigation size={14} className="text-brand-green" />
          </a>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={14} className="text-white/70" />
          </button>
        </div>
      </div>

      {park.description ? (
        <p className="text-sm text-white/60 mb-3 leading-relaxed">{park.description}</p>
      ) : null}

      {community ? (
        <div className="mb-3">
          <Link href={`/community/${community.id}`}>
            <div
              className="flex items-center gap-3 p-3 rounded-2xl border border-brand-green/30"
              style={{ backgroundColor: '#1ED75F15' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1ED75F22' }}
              >
                <span className="text-base font-black text-brand-green">
                  {community.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate">{community.name}</p>
                  {community.verified && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: '#3B82F625', color: '#3B82F6' }}>✓</span>
                  )}
                </div>
                <p className="text-xs text-white/45">{community.memberCount} membri</p>
              </div>
              <ChevronRight size={16} className="text-brand-green flex-shrink-0" />
            </div>
          </Link>

          {/* Upcoming trainings */}
          {parkTrainings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-brand-green/70 tracking-widest">ANTRENAMENTE</p>
              {parkTrainings.map(t => {
                const memberGoing = Object.values(t.rsvps ?? {}).filter(s => s === 'GOING').length
                const guestGoing = Object.values(t.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                const totalGoing = memberGoing + guestGoing
                const dateObj = parseMapTrainingDate(t)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
                const timeLabel = t.timeStart?.slice(-5) ?? ''
                return (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl border border-brand-green/20"
                    style={{ backgroundColor: '#0D3D2820' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">{t.name}</p>
                      {totalGoing > 0 && (
                        <span className="text-xs text-brand-green font-bold flex-shrink-0">{totalGoing} merg</span>
                      )}
                    </div>
                    <p className="text-xs text-white/45 mt-0.5">
                      {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
                      {t.location ? ` · ${t.location}` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3">
          {parkPendingReq ? (
            <div className="flex items-center gap-2 p-3 rounded-2xl border border-yellow-400/25"
              style={{ backgroundColor: '#F9731610' }}>
              <span className="text-sm">⏳</span>
              <p className="text-xs text-yellow-400 font-semibold">Cerere în așteptare</p>
            </div>
          ) : uid ? (
            showCommChoice ? (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-white/35 tracking-widest px-1">ADAUGĂ COMUNITATE</p>
                <button
                  onClick={() => { setShowCommChoice(false); setShowCreateCommForm(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-brand-green/30 text-left hover:bg-brand-green/10 transition-colors"
                  style={{ backgroundColor: '#1ED75F08' }}
                >
                  <span className="text-xl">🏗️</span>
                  <div>
                    <p className="text-sm font-bold text-white">Creează comunitate nouă</p>
                    <p className="text-xs text-white/45">Pornești o comunitate pentru acest parc</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowCommChoice(false); setShowParkCommModal(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/15 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-xl">🔗</span>
                  <div>
                    <p className="text-sm font-bold text-white">Asociază comunitate existentă</p>
                    <p className="text-xs text-white/45">Leagă o comunitate pe care o administrezi</p>
                  </div>
                </button>
                <button onClick={() => setShowCommChoice(false)} className="text-xs text-white/35 text-center py-1">Anulează</button>
              </div>
            ) : (
              <button
                onClick={() => setShowCommChoice(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors"
                style={{ backgroundColor: '#1ED75F08' }}
              >
                <span className="text-base">＋</span> Adaugă comunitate
              </button>
            )
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-2xl border border-white/10"
              style={{ backgroundColor: 'var(--app-bg)' }}>
              <MapPin size={14} className="text-white/30" />
              <p className="text-xs text-white/40">Nicio comunitate asociată acestui parc</p>
            </div>
          )}
        </div>
      )}

      {members.length > 0 && (
        <div>
          <p className="text-xs font-bold text-white/45 tracking-widest mb-2">
            ACTIVI ACUM ({members.length})
          </p>
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.uid} className="flex items-center gap-2.5">
                <MemberAvatar name={m.displayName} photoUrl={liveLocations[m.uid] ?? m.photoUrl} />
                <span className="text-sm text-white/80">{m.displayName}</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-brand-green animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Associate existing community modal */}
      {showParkCommModal && uid && (
        <ParkCommunityModal
          park={park}
          uid={uid}
          userAdminCommunities={userAdminCommunities}
          onClose={() => setShowParkCommModal(false)}
          onSubmitted={req => { onPendingReqSet(req); setShowParkCommModal(false) }}
        />
      )}

      {/* Create new community for this park */}
      {showCreateCommForm && uid && (
        <CreateCommunityForParkModal
          park={park}
          uid={uid}
          userName={userName}
          onClose={() => setShowCreateCommForm(false)}
          onPending={req => { onPendingReqSet(req); setShowCreateCommForm(false) }}
        />
      )}
    </div>
  )
}

// ── Park Community Modal ──────────────────────────────────────────────────────

function ParkCommunityModal({
  park, uid, userAdminCommunities, onClose, onSubmitted,
}: {
  park: ParkDoc
  uid: string
  userAdminCommunities: CommunityDoc[]
  onClose: () => void
  onSubmitted: (req: ParkCommunityRequest) => void
}) {
  const [alreadyRequested, setAlreadyRequested] = useState(false)
  const [selectedCommunityId, setSelectedCommunityId] = useState(userAdminCommunities[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    getDocs(query(
      collection(db, 'park_community_requests'),
      where('requestedByUid', '==', uid),
      where('status', '==', 'PENDING')
    )).then(snap => {
      const todayReq = snap.docs.find(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts.toISOString().slice(0, 10) === today
      })
      setAlreadyRequested(!!todayReq)
      setChecking(false)
    }).catch(() => setChecking(false))
  }, [uid])

  async function submit() {
    if (!selectedCommunityId || submitting) return
    const community = userAdminCommunities.find(c => c.id === selectedCommunityId)
    if (!community) return
    setSubmitting(true)
    try {
      const docRef = await addDoc(collection(db, 'park_community_requests'), {
        parkId: park.id,
        parkName: park.name,
        communityId: community.id,
        communityName: community.name,
        requestedByUid: uid,
        requestedByName: '',
        status: 'PENDING',
        createdAt: serverTimestamp(),
      })
      const req: ParkCommunityRequest = {
        id: docRef.id,
        parkId: park.id,
        parkName: park.name,
        communityId: community.id,
        communityName: community.name,
        requestedByUid: uid,
        requestedByName: '',
        status: 'PENDING',
        createdAt: null,
      }
      onSubmitted(req)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-black text-white">Asociază comunitate</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/50 mb-4">{park.name}</p>

        {checking ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : alreadyRequested ? (
          <div className="p-3 rounded-xl border border-yellow-400/25 text-xs text-yellow-400"
            style={{ backgroundColor: '#F9731610' }}>
            Ai deja o cerere astăzi. Poți trimite o nouă cerere mâine.
          </div>
        ) : userAdminCommunities.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-white/50 mb-3">Nu ești admin în nicio comunitate.</p>
            <Link href="/community/create">
              <button className="h-9 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
                Creează o comunitate
              </button>
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">SELECTEAZĂ COMUNITATEA</p>
            <div className="flex flex-col gap-2 mb-4">
              {userAdminCommunities.map(c => (
                <button key={c.id}
                  onClick={() => setSelectedCommunityId(c.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selectedCommunityId === c.id
                      ? 'border-brand-green/50 bg-brand-green/10'
                      : 'border-white/10 bg-white/4'
                  }`}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: selectedCommunityId === c.id ? '#1ED75F' : '#ffffff30' }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.name}</p>
                    <p className="text-xs text-white/40">{c.memberCount} membri</p>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={submit} disabled={submitting || !selectedCommunityId}
              className="w-full h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
              {submitting ? '...' : 'Trimite cererea'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Community For Park Modal ──────────────────────────────────────────

function CreateCommunityForParkModal({
  park, uid, userName, onClose, onPending,
}: {
  park: ParkDoc
  uid: string
  userName: string
  onClose: () => void
  onPending: (req: ParkCommunityRequest) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors"

  async function create() {
    if (!name.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      // 3/day rate limit — fetch user's NEW requests, filter client-side by today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const rateSnap = await getDocs(query(
        collection(db, 'park_community_requests'),
        where('requestedByUid', '==', uid),
        where('status', '==', 'NEW')
      ))
      const todayCount = rateSnap.docs.filter(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts >= todayStart
      }).length
      if (todayCount >= 3) {
        setError('Ai atins limita de 3 cereri pe zi.')
        setSaving(false)
        return
      }

      const commRef = await addDoc(collection(db, 'communities'), {
        name: name.trim(),
        description: description.trim(),
        location: park.address ? `${park.address}${park.city ? ', ' + park.city : ''}` : park.name,
        latitude: park.latitude,
        longitude: park.longitude,
        creatorId: uid,
        creatorName: userName,
        memberCount: 1,
        isPublic,
        imageUrl: '',
        verified: false,
        createdAt: serverTimestamp(),
      })
      // Add creator as ADMIN member
      await setDoc(doc(db, 'communities', commRef.id, 'members', uid), {
        userId: uid,
        displayName: userName,
        role: 'ADMIN',
        level: 1,
        points: 0,
        photoUrl: '',
        joinedAt: serverTimestamp(),
      })
      // Add to user's joined communities
      await updateDoc(doc(db, 'users', uid), { joinedCommunityIds: arrayUnion(commRef.id) })
      // Submit for admin review — park will be linked after approval
      const reqRef = await addDoc(collection(db, 'park_community_requests'), {
        parkId: park.id,
        parkName: park.name,
        communityId: commRef.id,
        communityName: name.trim(),
        requestedByUid: uid,
        requestedByName: userName,
        status: 'NEW',
        createdAt: serverTimestamp(),
      })
      const req: ParkCommunityRequest = {
        id: reqRef.id,
        parkId: park.id,
        parkName: park.name,
        communityId: commRef.id,
        communityName: name.trim(),
        requestedByUid: uid,
        requestedByName: userName,
        status: 'NEW',
        createdAt: null,
      }
      onPending(req)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-black text-white">Comunitate nouă</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">Parc: {park.name}</p>
        <div className="flex flex-col gap-2.5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Numele comunității *" className={inputCls} />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Descriere (opțional)"
            rows={2}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors resize-none" />
          <button onClick={() => setIsPublic(p => !p)}
            className="flex items-center gap-2 p-3 rounded-xl border border-white/12">
            <div className={`w-8 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-brand-green' : 'bg-white/20'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isPublic ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-white/70">{isPublic ? 'Publică' : 'Privată'}</span>
          </button>
          <p className="text-[11px] text-white/35 px-1">
            Cererea va fi trimisă administratorului. Parcul va fi asociat și comunitatea verificată după aprobare.
          </p>
          {error && <p className="text-xs text-red-400 px-1">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60">Anulează</button>
            <button onClick={create} disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
              {saving ? '...' : 'Trimite cererea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MemberAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#1ED75F33' }}
    >
      {photoUrl && !imgError
        ? <Image src={photoUrl} alt={name} fill sizes="32px" className="object-cover" onError={() => setImgError(true)} />
        : <span className="text-xs font-black text-brand-green">{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}
