'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'
import Image from 'next/image'
import {
  collection, onSnapshot, doc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, query, where, addDoc, updateDoc, arrayUnion, increment, deleteField,
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
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useTheme } from '@/lib/hooks/useTheme'
import { useT } from '@/lib/context/LanguageContext'
import type { ParkDoc, ParkPresenceMember, CommunityDoc, LocationSharingMode, ParkCommunityRequest, PlannedTraining, CommunityMember } from '@/types'
import { createNotification } from '@/lib/firebase/notifications'
import { MapPin, X, Navigation, ChevronRight, ChevronLeft, Calendar, Clock, Dumbbell, Users } from 'lucide-react'
import Link from 'next/link'
import {
  MapContainer, TileLayer, Marker, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ParkRequestModal from '@/components/map/ParkRequestModal'

// ── Custom Leaflet icons ─────────────────────────────────────────────────────

let _iconSeq = 0
function makeParkIcon(hasComm: boolean, activeCount: number, hasUpcomingTraining = false) {
  const uid = `pi${++_iconSeq}`
  const color = hasUpcomingTraining ? '#1ED75F' : hasComm ? '#3B82F6' : '#6B7280'
  const ring = activeCount > 0
    ? `<circle cx="20" cy="20" r="16" fill="none" stroke="${color}" stroke-width="2" opacity="0.5" class="pulse-ring"/>`
    : ''
  const glowDefs = (hasComm || hasUpcomingTraining) ? `
    <defs>
      <radialGradient id="g_${uid}" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="${hasUpcomingTraining ? '#1ED75F' : '#60A5FA'}"/>
        <stop offset="100%" stop-color="${color}"/>
      </radialGradient>
      <filter id="glow_${uid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>` : ''
  const pinFill = (hasComm || hasUpcomingTraining) ? `url(#g_${uid})` : color
  const pinFilter = (hasComm || hasUpcomingTraining) ? `filter="url(#glow_${uid})"` : ''
  const strokeW = (hasComm || hasUpcomingTraining) ? '2' : '1.5'
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
  const t = useT()
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
          {denied ? t('map.location_blocked_title') : t('map.location_access_title')}
        </h2>
        {denied ? (
          <>
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              {t('map.location_blocked_text')}
            </p>
            <button
              onClick={onDeny}
              className="w-full h-12 rounded-2xl text-sm font-bold border border-white/20 text-white/70"
            >
              {t('map.continue_without')}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              {t('map.location_desc')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onAllow}
                className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-bold"
              >
                {t('map.allow_location')}
              </button>
              <button
                onClick={onDeny}
                className="w-full h-12 rounded-2xl text-sm font-semibold text-white/50"
              >
                {t('map.not_now')}
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
  const t = useT()
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
          {t('map.onboarding_title')}
        </h2>
        <p className="text-sm text-white/50 leading-relaxed mb-5">
          {t('map.onboarding_subtitle')}
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
              {locating ? t('map.detecting') : t('map.use_location')}
            </button>
            <button
              onClick={() => setShowCities(true)}
              className="w-full h-12 rounded-2xl font-semibold text-sm border text-white/70 transition-colors hover:text-white/90"
              style={{ borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'transparent' }}
            >
              {t('map.choose_city')}
            </button>
          </div>
        )}

        {/* City list */}
        {showCities && (
          <div>
            <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-3">
              {t('map.select_city_title')}
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
              {t('map.back')}
            </button>
          </div>
        )}

        {/* Skip */}
        <button
          onClick={onSkip}
          className="mt-4 w-full text-center text-xs text-white/25 hover:text-white/45 transition-colors"
        >
          {t('map.explore_no_location')}
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
  const { displayName: myDisplayName, photoUrl: myPhoto } = useMyProfile()
  const { theme } = useTheme()
  const t = useT()
  const isSuperAdmin = user?.email === (process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? '')

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
  const [parkStandaloneTrainings, setParkStandaloneTrainings] = useState<PlannedTraining[]>([])
  const [parkPastTrainings, setParkPastTrainings] = useState<PlannedTraining[]>([])
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([])
  const [selectedTraining, setSelectedTraining] = useState<PlannedTraining | null>(null)
  const [selectedTrainingSource, setSelectedTrainingSource] = useState<'community' | 'standalone' | null>(null)
  const [showParkTrainingForm, setShowParkTrainingForm] = useState(false)
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
          displayName: myDisplayName || user.displayName || '',
          photoUrl: myPhoto || user.photoURL || '',
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
    if (!localStorage.getItem(LOCATION_CONSENT_KEY)) {
      localStorage.setItem(LOCATION_CONSENT_KEY, 'denied')
    }
    setShowPermSheet(false)
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
    localStorage.setItem(LOCATION_CONSENT_KEY, 'denied')
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
      // Filter to ADMIN role — skip the member read for communities the user created
      const adminComms: CommunityDoc[] = []
      await Promise.all(allComms.map(async c => {
        if (c.creatorId === uid) { adminComms.push(c); return }
        const mem = await getDoc(doc(db, 'communities', c.id, 'members', uid))
        if (mem.exists() && mem.data().role === 'ADMIN') adminComms.push(c)
      }))
      if (!cancelled) setUserAdminCommunities(adminComms)
    })
    return () => { cancelled = true }
  }, [user])

  // Load parks once — parks rarely change so a real-time listener is wasteful
  useEffect(() => {
    getDocs(collection(db, 'parks'))
      .then(async snap => {
        const parksData = snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkDoc)
        // For community parks, also check if the community has upcoming trainings
        // (standalone trainings use park.upcomingTrainingCount, but community trainings don't)
        const now = new Date()
        await Promise.all(
          parksData
            .filter(p => p.communityId)
            .map(async park => {
              try {
                const trainSnap = await getDocs(collection(db, 'communities', park.communityId!, 'trainings'))
                const hasUpcoming = trainSnap.docs.some(d => {
                  const tr = d.data() as PlannedTraining
                  if (tr.deletedAt) return false
                  const s = parseMapTrainingDate(tr)
                  return !s || s >= now
                })
                if (hasUpcoming) {
                  park.upcomingTrainingCount = (park.upcomingTrainingCount ?? 0) + 1
                }
              } catch {}
            })
        )
        setParks(parksData)
      })
      .catch(() => {})
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
      setParkStandaloneTrainings([])
      setParkPastTrainings([])
      setCommunityMembers([])
      setSelectedTraining(null)
      setSelectedTrainingSource(null)
      setParkPendingReq(null)
      return
    }
    if (!selectedPark.communityId) {
      setParkCommunity(null)
      setParkPresenceMembers([])
      setParkTrainings([])
      setShowParkTrainingForm(false)
      // Load standalone park trainings
      const now = new Date()
      getDocs(collection(db, 'parks', selectedPark.id, 'trainings'))
        .then(snap => {
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlannedTraining).filter(t => !t.deletedAt)
          const upcoming = all
            .filter(t => { const s = parseMapTrainingDate(t); return !s || s >= now })
            .sort((a, b) => (parseMapTrainingDate(a)?.getTime() ?? 0) - (parseMapTrainingDate(b)?.getTime() ?? 0))
          setParkStandaloneTrainings(upcoming)
          if (upcoming.length === 0) {
            const past = all
              .filter(t => { const s = parseMapTrainingDate(t); return s !== null && s < now })
              .sort((a, b) => (parseMapTrainingDate(b)?.getTime() ?? 0) - (parseMapTrainingDate(a)?.getTime() ?? 0))
              .slice(0, 3)
            setParkPastTrainings(past)
          } else {
            setParkPastTrainings([])
          }
        })
        .catch(() => { setParkStandaloneTrainings([]); setParkPastTrainings([]) })
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
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlannedTraining).filter(t => !t.deletedAt)
        const upcoming = all
          .filter(t => { const start = parseMapTrainingDate(t); return !start || start >= now })
          .sort((a, b) => (parseMapTrainingDate(a)?.getTime() ?? 0) - (parseMapTrainingDate(b)?.getTime() ?? 0))
          .slice(0, 3)
        setParkTrainings(upcoming)
        if (upcoming.length === 0) {
          const past = all
            .filter(t => { const s = parseMapTrainingDate(t); return s !== null && s < now })
            .sort((a, b) => (parseMapTrainingDate(b)?.getTime() ?? 0) - (parseMapTrainingDate(a)?.getTime() ?? 0))
            .slice(0, 3)
          setParkPastTrainings(past)
        } else {
          setParkPastTrainings([])
        }
      })
      .catch(() => { setParkTrainings([]); setParkPastTrainings([]) })
    // Load community members (public read after rules fix — sorted by role)
    getDocs(collection(db, 'communities', selectedPark.communityId, 'members'))
      .then(snap => {
        const roleOrder: Record<string, number> = { ADMIN: 0, TRAINER: 1, MODERATOR: 2, MEMBER: 3 }
        const sorted = snap.docs.map(d => d.data() as CommunityMember)
          .sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4))
        setCommunityMembers(sorted)
      })
      .catch(() => setCommunityMembers([]))
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
    const timer = setTimeout(dismissCallout, 6000)
    return () => clearTimeout(timer)
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
    <div ref={mapContainerRef} className="relative flex flex-col h-[calc(100dvh-56px-env(safe-area-inset-bottom,0px))] md:h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* First-visit onboarding sheet */}
      {showMapIntro && (
        <MapOnboardingSheet
          onLocationGranted={handleIntroLocationGranted}
          onCitySelected={handleIntroCitySelected}
          onSkip={finishMapIntro}
        />
      )}

      {/* Location permission sheet (auth users only) */}
      {showPermSheet && !showMapIntro && (
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
              placeholder={t('map.search_placeholder')}
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
              ['all', t('map.filter_all')],
              ['community', t('map.filter_community')],
              ['nocommunity', t('map.filter_nocommunity')],
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
            const hasUpcomingTraining = (park.upcomingTrainingCount ?? 0) > 0
            return (
              <Marker
                key={park.id}
                position={[park.latitude, park.longitude]}
                icon={makeParkIcon(!!park.communityId, activeCount, hasUpcomingTraining)}
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
                {t('map.callout_community')}
              </span>
              <button
                onClick={e => { e.stopPropagation(); dismissCallout() }}
                className="text-white/30 hover:text-white/60 transition-colors text-xs leading-none mt-0.5"
              >
                ✕
              </button>
            </div>
            <p className="text-[12px] text-white/75 leading-snug">
              {t('map.callout_text')}
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
          <Navigation size={14} />{t('map.location_off')}
        </div>
      ) : sharing ? (
        /* Active sharing indicator — no stop button */
        <div className="absolute bottom-4 left-4 z-[1000] h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg bg-brand-green/15 border border-brand-green/30 text-brand-green">
          <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
          {locationSharingMode === 'FRIENDS_ONLY' ? t('map.sharing_friends') : t('map.location_active')}
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
          <Navigation size={14} />{locationSharingMode === 'FRIENDS_ONLY' ? t('map.sharing_friends') : t('map.share_location')}
        </button>
      ))}

      {/* Request a park button (authenticated only) */}
      {user && (
      <button
        onClick={() => setShowParkRequest(true)}
        className="absolute bottom-16 left-4 z-[1000] h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md"
        style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)' }}
      >
        <MapPin size={12} className="text-brand-green" /> {t('map.request_park')}
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
          onClose={() => { setSelectedPark(null); setShowParkCommModal(false); setShowParkTrainingForm(false); setSelectedTraining(null); setSelectedTrainingSource(null) }}
          uid={user?.uid ?? null}
          isSuperAdmin={isSuperAdmin}
          userName={myDisplayName}
          parkTrainings={parkTrainings}
          parkStandaloneTrainings={parkStandaloneTrainings}
          onStandaloneTrainingAdded={t => setParkStandaloneTrainings(prev => [...prev, t])}
          onStandaloneTrainingDeleted={id => setParkStandaloneTrainings(prev => prev.filter(t => t.id !== id))}
          showParkTrainingForm={showParkTrainingForm}
          setShowParkTrainingForm={setShowParkTrainingForm}
          parkPendingReq={parkPendingReq}
          userAdminCommunities={userAdminCommunities}
          showParkCommModal={showParkCommModal}
          setShowParkCommModal={setShowParkCommModal}
          onPendingReqSet={req => setParkPendingReq(req)}
          onCommunityCreated={comm => setParkCommunity(comm)}
          onDirectAssociated={() => setSelectedPark(null)}
          parkPastTrainings={parkPastTrainings}
          communityMembers={communityMembers}
          selectedTraining={selectedTraining}
          selectedTrainingSource={selectedTrainingSource}
          onTrainingSelect={(tr, source) => { setSelectedTraining(tr); setSelectedTrainingSource(source) }}
          onTrainingBack={() => { setSelectedTraining(null); setSelectedTrainingSource(null) }}
        />
      )}
    </div>
  )
}

// ── Park Bottom Sheet ─────────────────────────────────────────────────────────

function ParkBottomSheet({
  park, community, members, liveLocations, onClose,
  uid, isSuperAdmin, userName, parkTrainings, parkStandaloneTrainings, onStandaloneTrainingAdded,
  onStandaloneTrainingDeleted,
  showParkTrainingForm, setShowParkTrainingForm,
  parkPendingReq, userAdminCommunities,
  showParkCommModal, setShowParkCommModal, onPendingReqSet, onCommunityCreated: _onCommunityCreated,
  onDirectAssociated,
  parkPastTrainings, communityMembers,
  selectedTraining, selectedTrainingSource,
  onTrainingSelect, onTrainingBack,
}: {
  park: ParkDoc
  community: CommunityDoc | null
  members: ParkPresenceMember[]
  liveLocations: Record<string, string>
  onClose: () => void
  uid: string | null
  isSuperAdmin: boolean
  userName: string
  parkTrainings: PlannedTraining[]
  parkStandaloneTrainings: PlannedTraining[]
  onStandaloneTrainingAdded: (t: PlannedTraining) => void
  onStandaloneTrainingDeleted: (id: string) => void
  showParkTrainingForm: boolean
  setShowParkTrainingForm: (v: boolean) => void
  parkPendingReq: ParkCommunityRequest | null
  userAdminCommunities: CommunityDoc[]
  showParkCommModal: boolean
  setShowParkCommModal: (v: boolean) => void
  onPendingReqSet: (req: ParkCommunityRequest) => void
  onCommunityCreated: (comm: CommunityDoc) => void
  onDirectAssociated: () => void
  parkPastTrainings: PlannedTraining[]
  communityMembers: CommunityMember[]
  selectedTraining: PlannedTraining | null
  selectedTrainingSource: 'community' | 'standalone' | null
  onTrainingSelect: (tr: PlannedTraining, source: 'community' | 'standalone') => void
  onTrainingBack: () => void
}) {
  const { theme } = useTheme()
  const t = useT()
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

      {selectedTraining ? (
        <TrainingDetailPanel
          training={selectedTraining}
          communityId={selectedTrainingSource === 'community' ? community?.id ?? null : null}
          parkId={selectedTrainingSource === 'standalone' ? park.id : null}
          communityMembers={communityMembers}
          onBack={onTrainingBack}
          onClose={onClose}
        />
      ) : (<>

      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-black text-white text-base leading-tight">{park.name}</h2>
            {members.length > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: '#1ED75F18', color: '#1ED75F', border: '1px solid #1ED75F30' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse inline-block" />
                {members.length} {members.length === 1 ? 'activ' : 'activi'}
              </span>
            )}
          </div>
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
                <p className="text-xs text-white/45">{community.memberCount} {t('common.members')}</p>
              </div>
              <ChevronRight size={16} className="text-brand-green flex-shrink-0" />
            </div>
          </Link>

          {/* Upcoming trainings */}
          {parkTrainings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-brand-green/70 tracking-widest">{t('map.trainings_section')}</p>
              {parkTrainings.map(tr => {
                const memberGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                const guestGoing = Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                const totalGoing = memberGoing + guestGoing
                const dateObj = parseMapTrainingDate(tr)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
                const timeLabel = tr.timeStart?.slice(-5) ?? ''
                return (
                  <button key={tr.id} onClick={() => onTrainingSelect(tr, 'community')} className="w-full text-left">
                    <div className="p-2.5 rounded-xl border border-brand-green/20 hover:bg-brand-green/5 transition-colors"
                      style={{ backgroundColor: '#0D3D2820' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">{tr.name}</p>
                        {totalGoing > 0 && (
                          <span className="text-xs text-brand-green font-bold flex-shrink-0">{totalGoing} {t(totalGoing === 1 ? 'map.going_singular' : 'map.going_plural')}</span>
                        )}
                      </div>
                      <p className="text-xs text-white/45 mt-0.5">
                        {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}{tr.location ? ` · ${tr.location}` : ''}
                      </p>
                      {(tr.exercises ?? []).length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {(tr.exercises ?? []).slice(0, 2).map((ex, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(30,215,95,0.12)', color: '#1ED75F' }}>
                              {ex.name}
                            </span>
                          ))}
                          {(tr.exercises?.length ?? 0) > 2 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/30"
                              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                              +{(tr.exercises?.length ?? 0) - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Past trainings fallback */}
          {parkTrainings.length === 0 && parkPastTrainings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-white/35 tracking-widest">{t('map.recent_activity')}</p>
              {parkPastTrainings.map(tr => {
                const dateObj = parseMapTrainingDate(tr)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
                const totalGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                  + Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                return (
                  <button key={tr.id} onClick={() => onTrainingSelect(tr, 'community')} className="w-full text-left opacity-70">
                    <div className="p-2.5 rounded-xl border border-white/8"
                      style={{ backgroundColor: 'rgba(13,27,26,0.4)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white/60 leading-tight flex-1 truncate">{tr.name}</p>
                        {totalGoing > 0 && <span className="text-xs text-white/35 flex-shrink-0">{totalGoing} participanți</span>}
                      </div>
                      <p className="text-xs text-white/30 mt-0.5">{dateLabel}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Community training history button */}
          <div className="mt-2">
            <Link href={`/training/${community.id}/history`} onClick={onClose}>
              <button
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-white/15 text-white/60 text-sm font-semibold hover:bg-white/5 transition-colors"
              >
                <span className="text-base">🕓</span> {t('map.training_history')}
              </button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          {/* Standalone upcoming trainings */}
          {parkStandaloneTrainings.length > 0 && (
            <div className="mb-3">
              <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1.5">{t('map.planned_trainings')}</p>
              <div className="flex flex-col gap-1.5">
                {parkStandaloneTrainings.map(tr => {
                  const dateObj = parseMapTrainingDate(tr)
                  const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
                  const timeLabel = tr.timeStart?.slice(-5) ?? ''
                  const memberGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                  const guestGoing = Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                  const totalGoing = memberGoing + guestGoing
                  const isAuthor = uid === tr.authorId

                  async function handleDelete(e: React.MouseEvent) {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!window.confirm('Ești sigur că vrei să ștergi acest antrenament?')) return
                    try {
                      await updateDoc(doc(db, 'parks', park.id, 'trainings', tr.id), {
                        deletedAt: serverTimestamp(), deletedByUid: uid,
                      })
                      await updateDoc(doc(db, 'parks', park.id), { upcomingTrainingCount: increment(-1) })
                      onStandaloneTrainingDeleted(tr.id)
                    } catch { /* ignore */ }
                  }

                  return (
                    <button key={tr.id} onClick={() => onTrainingSelect(tr, 'standalone')} className="w-full text-left">
                      <div className="p-2.5 rounded-xl border border-brand-green/20 hover:bg-brand-green/5 transition-colors"
                        style={{ backgroundColor: '#0D3D2810' }}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">{tr.name}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {totalGoing > 0 && (
                              <span className="text-xs text-brand-green font-bold">{totalGoing} {t(totalGoing === 1 ? 'map.going_singular' : 'map.going_plural')}</span>
                            )}
                            {isSuperAdmin && (
                              <button
                                onClick={handleDelete}
                                className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                                title="Șterge antrenamentul"
                              >
                                <X size={10} className="text-red-400" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-white/45 mt-0.5">
                          {tr.authorName && `${tr.authorName} · `}{dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
                        </p>
                        {(tr.exercises ?? []).length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {(tr.exercises ?? []).slice(0, 2).map((ex, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: 'rgba(30,215,95,0.12)', color: '#1ED75F' }}>
                                {ex.name}
                              </span>
                            ))}
                            {(tr.exercises?.length ?? 0) > 2 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full text-white/30"
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                +{(tr.exercises?.length ?? 0) - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Standalone past trainings fallback */}
          {parkStandaloneTrainings.length === 0 && parkPastTrainings.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-white/35 tracking-widest">{t('map.recent_activity')}</p>
              {parkPastTrainings.map(tr => {
                const dateObj = parseMapTrainingDate(tr)
                const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
                const totalGoing = Object.values(tr.rsvps ?? {}).filter(s => s === 'GOING').length
                  + Object.values(tr.guestRsvps ?? {}).filter(g => g.status === 'GOING').length
                return (
                  <button key={tr.id} onClick={() => onTrainingSelect(tr, 'standalone')} className="w-full text-left opacity-70">
                    <div className="p-2.5 rounded-xl border border-white/8"
                      style={{ backgroundColor: 'rgba(13,27,26,0.4)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white/60 leading-tight flex-1 truncate">{tr.name}</p>
                        {totalGoing > 0 && <span className="text-xs text-white/35 flex-shrink-0">{totalGoing} participanți</span>}
                      </div>
                      <p className="text-xs text-white/30 mt-0.5">{dateLabel}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Plan training button */}
          {uid && (
            <button
              onClick={() => setShowParkTrainingForm(true)}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors mb-2"
              style={{ backgroundColor: '#0D3D2810' }}
            >
              <span className="text-base">📅</span> {t('map.plan_training')}
            </button>
          )}

          {/* Training history button */}
          <Link href={`/training/park/${park.id}/history`} onClick={onClose}>
            <button
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-white/15 text-white/60 text-sm font-semibold hover:bg-white/5 transition-colors mb-2"
            >
              <span className="text-base">🕓</span> {t('map.training_history')}
            </button>
          </Link>

          {parkPendingReq ? (
            <div className="flex items-center gap-2 p-3 rounded-2xl border border-yellow-400/25"
              style={{ backgroundColor: '#F9731610' }}>
              <span className="text-sm">⏳</span>
              <p className="text-xs text-yellow-400 font-semibold">{t('map.pending_req')}</p>
            </div>
          ) : uid ? (
            showCommChoice ? (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold text-white/35 tracking-widest px-1">{t('map.add_community_title')}</p>
                <button
                  onClick={() => { setShowCommChoice(false); setShowCreateCommForm(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-brand-green/30 text-left hover:bg-brand-green/10 transition-colors"
                  style={{ backgroundColor: '#1ED75F08' }}
                >
                  <span className="text-xl">🏗️</span>
                  <div>
                    <p className="text-sm font-bold text-white">{t('map.create_new_comm')}</p>
                    <p className="text-xs text-white/45">{t('map.create_new_comm_desc')}</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowCommChoice(false); setShowParkCommModal(true) }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/15 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="text-xl">🔗</span>
                  <div>
                    <p className="text-sm font-bold text-white">{t('map.assoc_comm')}</p>
                    <p className="text-xs text-white/45">{t('map.assoc_comm_desc')}</p>
                  </div>
                </button>
                <button onClick={() => setShowCommChoice(false)} className="text-xs text-white/35 text-center py-1">{t('map.cancel')}</button>
              </div>
            ) : (
              <button
                onClick={() => setShowCommChoice(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-brand-green/30 text-brand-green text-sm font-bold hover:bg-brand-green/10 transition-colors"
                style={{ backgroundColor: '#1ED75F08' }}
              >
                {t('map.add_community_btn')}
              </button>
            )
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-2xl border border-white/10"
              style={{ backgroundColor: 'var(--app-bg)' }}>
              <MapPin size={14} className="text-white/30" />
              <p className="text-xs text-white/40">{t('map.no_community')}</p>
            </div>
          )}
        </div>
      )}

      {/* Community members preview strip */}
      {communityMembers.length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-bold text-white/35 tracking-widest mb-2">
            {t('map.community_members')} ({communityMembers.length})
          </p>
          <div className="flex items-end gap-2">
            {communityMembers.slice(0, 5).map(m => (
              <div key={m.userId} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <MemberAvatar name={m.displayName} photoUrl={m.photoUrl ?? ''} />
                <span className="text-[9px] text-white/35 w-9 truncate text-center">
                  {m.displayName.split(' ')[0]}
                </span>
              </div>
            ))}
            {communityMembers.length > 5 && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <span className="text-[10px] text-white/40">+{communityMembers.length - 5}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div>
          <p className="text-xs font-bold text-white/45 tracking-widest mb-2">
            {t('map.active_now', { n: members.length })}
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

      {/* Guest "Join for More" CTA */}
      {uid === null && (
        <div className="mt-4 p-3 rounded-2xl flex items-center gap-3"
          style={{ backgroundColor: 'rgba(30,215,95,0.07)', border: '1px solid rgba(30,215,95,0.15)' }}>
          <span className="text-xl flex-shrink-0">💪</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white/80">{t('map.join_cta_title')}</p>
            <p className="text-[10px] text-white/40 leading-snug mt-0.5">{t('map.join_cta_desc')}</p>
          </div>
          <Link href="/register" onClick={onClose} className="flex-shrink-0">
            <span className="text-xs font-black text-brand-green">{t('map.join_cta_btn')}</span>
          </Link>
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
          onDirectAssociated={() => { setShowParkCommModal(false); onDirectAssociated() }}
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

      {/* Add standalone training modal */}
      {showParkTrainingForm && uid && (
        <AddParkTrainingModal
          park={park}
          uid={uid}
          userName={userName}
          onClose={() => setShowParkTrainingForm(false)}
          onAdded={t => { onStandaloneTrainingAdded(t); setShowParkTrainingForm(false) }}
        />
      )}
      </>)}
    </div>
  )
}

// ── Training Detail Panel (inline guest view) ─────────────────────────────────

function TrainingDetailPanel({
  training, communityId, parkId, communityMembers, onBack, onClose,
}: {
  training: PlannedTraining
  communityId: string | null
  parkId: string | null
  communityMembers: CommunityMember[]
  onBack: () => void
  onClose: () => void
}) {
  const t = useT()
  const [liveTraining, setLiveTraining] = useState<PlannedTraining>(training)
  const [guestId, setGuestId] = useState('')
  const [guestInput, setGuestInput] = useState('')
  const [guestConfirmed, setGuestConfirmed] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [savingGuest, setSavingGuest] = useState(false)

  // Init guest ID from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    let id = localStorage.getItem('calipal_guest_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('calipal_guest_id', id) }
    setGuestId(id)
  }, [])

  // Real-time training snapshot
  useEffect(() => {
    const ref = communityId
      ? doc(db, 'communities', communityId, 'trainings', training.id)
      : doc(db, 'parks', parkId!, 'trainings', training.id)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setLiveTraining({ id: snap.id, ...snap.data() } as PlannedTraining)
    }, () => {})
    return unsub
  }, [training.id, communityId, parkId])

  // Sync guest RSVP state
  useEffect(() => {
    if (!guestId) return
    const g = liveTraining.guestRsvps?.[guestId]
    if (g) { setGuestConfirmed(true); setGuestName(g.name) }
    else { setGuestConfirmed(false) }
  }, [liveTraining, guestId])

  const trainingRef = communityId
    ? doc(db, 'communities', communityId, 'trainings', training.id)
    : doc(db, 'parks', parkId!, 'trainings', training.id)

  async function confirmGuestRsvp() {
    const name = guestInput.trim()
    if (!name || !guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(trainingRef, { [`guestRsvps.${guestId}`]: { name, status: 'GOING' } })
      if (communityId) {
        const now = Date.now()
        const lastAt = liveTraining.lastRsvpNotifAt?.toDate?.()?.getTime() ?? 0
        if (now - lastAt >= 60 * 60 * 1000) {
          await updateDoc(trainingRef, { lastRsvpNotifAt: serverTimestamp() })
          await createNotification(
            liveTraining.authorId, 'TRAINING_RSVP',
            'Cineva participă la antrenamentul tău! 💪',
            `${name} a confirmat că merge la „${liveTraining.name}".`,
            training.id,
          )
          fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toUid: liveTraining.authorId,
              title: 'Cineva participă la antrenamentul tău! 💪',
              body: `${name} a confirmat că merge la „${liveTraining.name}".`,
              url: `/training/${communityId}/${training.id}`,
            }),
          }).catch(() => {})
        }
      }
      setGuestInput('')
    } catch (e) { console.error(e) }
    finally { setSavingGuest(false) }
  }

  async function cancelGuestRsvp() {
    if (!guestId || savingGuest) return
    setSavingGuest(true)
    try {
      await updateDoc(trainingRef, { [`guestRsvps.${guestId}`]: deleteField() })
      setGuestConfirmed(false); setGuestName('')
    } catch (e) { console.error(e) }
    finally { setSavingGuest(false) }
  }

  const goingUids = Object.entries(liveTraining.rsvps ?? {}).filter(([, s]) => s === 'GOING').map(([uid]) => uid)
  const guestGoing = Object.entries(liveTraining.guestRsvps ?? {}).filter(([, g]) => g.status === 'GOING')
  const totalGoing = goingUids.length + guestGoing.length

  const dateObj = parseMapTrainingDate(liveTraining)
  const dateLabel = dateObj ? dateObj.toLocaleDateString('ro', { weekday: 'long', day: '2-digit', month: 'long' }) : ''
  const timeLabel = liveTraining.timeStart?.slice(-5) ?? ''
  const timeEnd = liveTraining.timeEnd?.slice(-5) ?? ''
  const fullPageHref = communityId
    ? `/training/${communityId}/${training.id}`
    : `/training/park/${parkId}/${training.id}`

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-white/60 hover:text-white transition-colors">
          <ChevronLeft size={16} />
          <span className="text-sm font-semibold">{t('map.training_detail_back')}</span>
        </button>
        <Link href={fullPageHref} onClick={onClose}>
          <span className="text-xs font-bold text-brand-green/80 hover:text-brand-green transition-colors">
            {t('map.view_full_page')}
          </span>
        </Link>
      </div>

      {/* Official badge */}
      {liveTraining.official && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mb-2"
          style={{ backgroundColor: '#FFB80018', color: '#FFB800', border: '1px solid #FFB80030' }}>
          ⭐ OFICIAL
        </span>
      )}

      {/* Title & author */}
      <h2 className="font-black text-white text-lg leading-tight mb-0.5">{liveTraining.name}</h2>
      <p className="text-xs text-white/45 mb-3">
        {liveTraining.authorName}
        {liveTraining.authorCoach && <span className="ml-1 text-brand-green font-semibold">· Coach</span>}
      </p>

      {/* Meta */}
      <div className="flex flex-col gap-1 mb-3">
        {dateLabel && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Calendar size={12} className="text-white/35 flex-shrink-0" />
            {dateLabel}
          </div>
        )}
        {(timeLabel || timeEnd) && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Clock size={12} className="text-white/35 flex-shrink-0" />
            {timeLabel}{timeEnd && timeEnd !== timeLabel ? ` – ${timeEnd}` : ''}
          </div>
        )}
        {liveTraining.location && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <MapPin size={12} className="text-white/35 flex-shrink-0" />
            {liveTraining.location}
          </div>
        )}
      </div>

      {/* Description */}
      {liveTraining.description && (
        <p className="text-sm text-white/60 leading-relaxed mb-3">{liveTraining.description}</p>
      )}

      {/* Exercises */}
      {(liveTraining.exercises ?? []).length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Dumbbell size={12} className="text-white/35" />
            <p className="text-[9px] font-bold text-white/35 tracking-widest">EXERCIȚII</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {liveTraining.exercises.map((ex, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ backgroundColor: '#1ED75F14', color: '#1ED75F', border: '1px solid #1ED75F25' }}>
                {ex.name} {ex.sets}×{ex.repsPerSet}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Equipment */}
      {(liveTraining.equipment ?? []).length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-bold text-white/35 tracking-widest mb-1.5">ECHIPAMENT</p>
          <div className="flex flex-wrap gap-1.5">
            {liveTraining.equipment!.map((eq, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
                {eq}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attendees */}
      {totalGoing > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users size={12} className="text-white/35" />
            <p className="text-[9px] font-bold text-white/35 tracking-widest">{totalGoing} PERSOANE MERG</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {goingUids.slice(0, 4).map(uid => {
              const m = communityMembers.find(cm => cm.userId === uid)
              const name = liveTraining.rsvpNames?.[uid] ?? m?.displayName ?? 'Membru'
              const photo = liveTraining.rsvpPhotos?.[uid] ?? m?.photoUrl ?? ''
              return <MemberAvatar key={uid} name={name} photoUrl={photo} />
            })}
            {guestGoing.slice(0, 2).map(([gid, g]) => (
              <div key={gid} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#ffffff12', border: '1px solid rgba(255,255,255,0.15)' }}
                title={`${g.name} (invitat)`}>
                <span className="text-[10px] font-bold text-white/50">{g.name.charAt(0).toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-white/8 my-3" />

      {/* Guest RSVP section */}
      <p className="text-[9px] font-bold text-white/35 tracking-widest mb-2">PARTICIPI?</p>
      {guestConfirmed ? (
        <div className="p-3 rounded-xl mb-2" style={{ backgroundColor: '#1ED75F12', border: '1px solid #1ED75F30' }}>
          <p className="text-sm font-semibold text-brand-green">Participi ca invitat! 🎉</p>
          <p className="text-xs text-white/50 mt-0.5">Înregistrat ca: <span className="font-bold text-white/70">{guestName}</span></p>
          <button onClick={cancelGuestRsvp} disabled={savingGuest}
            className="mt-2 text-xs text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-40">
            Anulează participarea
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={guestInput}
              onChange={e => setGuestInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmGuestRsvp()}
              placeholder="Numele tău (1–15 caractere)"
              maxLength={15}
              className="flex-1 h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
            />
            <button onClick={confirmGuestRsvp} disabled={savingGuest || guestInput.trim().length === 0}
              className="h-10 px-4 rounded-xl font-black text-sm text-black disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#1ED75F' }}>
              Merg 🏃
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] text-white/25">sau</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex gap-2">
            <Link href="/login" onClick={onClose} className="flex-1">
              <button className="w-full h-9 rounded-xl border border-white/15 text-xs font-semibold text-white/60">
                Intru în cont
              </button>
            </Link>
            <Link href="/register" onClick={onClose} className="flex-1">
              <button className="w-full h-9 rounded-xl text-xs font-bold text-black"
                style={{ backgroundColor: '#1ED75F' }}>
                Creează cont
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Park Community Modal ──────────────────────────────────────────────────────

function ParkCommunityModal({
  park, uid, userAdminCommunities, onClose, onSubmitted, onDirectAssociated,
}: {
  park: ParkDoc
  uid: string
  userAdminCommunities: CommunityDoc[]
  onClose: () => void
  onSubmitted: (req: ParkCommunityRequest) => void
  onDirectAssociated: () => void
}) {
  const t = useT()
  const [selectedCommunityId, setSelectedCommunityId] = useState(userAdminCommunities[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)

  // Admins (communities in userAdminCommunities) associate directly — no request needed
  async function submit() {
    if (!selectedCommunityId || submitting) return
    const community = userAdminCommunities.find(c => c.id === selectedCommunityId)
    if (!community) return
    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'parks', park.id), { communityId: community.id })
      onDirectAssociated()
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
          <p className="text-sm font-black text-white">{t('map.assoc_modal_title')}</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/50 mb-4">{park.name}</p>

        {userAdminCommunities.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-white/50 mb-3">{t('map.no_admin_comms')}</p>
            <Link href="/community/create">
              <button className="h-9 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
                {t('map.create_community')}
              </button>
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">{t('map.select_community')}</p>
            <p className="text-xs text-white/35 mb-3">{t('map.assoc_direct_note')}</p>
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
                    <p className="text-xs text-white/40">{c.memberCount} {t('common.members')}</p>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={submit} disabled={submitting || !selectedCommunityId}
              className="w-full h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
              {submitting ? '...' : t('map.assoc_direct_btn')}
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
  const t = useT()
  const { photoUrl: myPhoto } = useMyProfile()
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
        setError(t('map.rate_limit_3'))
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
        photoUrl: myPhoto || '',
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
          <p className="text-sm font-black text-white">{t('map.new_comm_title')}</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">{t('map.park_label', { name: park.name })}</p>
        <div className="flex flex-col gap-2.5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('map.comm_name_placeholder')}
            maxLength={80} className={inputCls} />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t('map.comm_desc_placeholder')}
            rows={2}
            maxLength={1000}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors resize-none" />
          <button onClick={() => setIsPublic(p => !p)}
            className="flex items-center gap-2 p-3 rounded-xl border border-white/12">
            <div className={`w-8 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-brand-green' : 'bg-white/20'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isPublic ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-white/70">{isPublic ? t('map.public_label') : t('map.private_label')}</span>
          </button>
          <p className="text-[11px] text-white/35 px-1">
            {t('map.comm_request_note')}
          </p>
          {error && <p className="text-xs text-red-400 px-1">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60">{t('map.cancel')}</button>
            <button onClick={create} disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
              {saving ? '...' : t('create.send_request_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Standalone Park Training Modal ───────────────────────────────────────

function AddParkTrainingModal({
  park, uid, userName, onClose, onAdded,
}: {
  park: ParkDoc
  uid: string
  userName: string
  onClose: () => void
  onAdded: (t: PlannedTraining) => void
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const t = useT()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('20:30')
  const [saving, setSaving] = useState(false)
  const [rateError, setRateError] = useState('')

  function fmt(dateStr: string, time: string): string {
    if (!dateStr || !time) return ''
    const [yyyy, mm, dd] = dateStr.split('-')
    return `${dd}/${mm}/${yyyy} ${time}`
  }

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    setRateError('')
    try {
      // Rate limit: max 5 trainings per day per park per user
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const rateCol = park.communityId
        ? collection(db, 'communities', park.communityId, 'trainings')
        : collection(db, 'parks', park.id, 'trainings')
      const rateSnap = await getDocs(query(rateCol, where('authorId', '==', uid)))
      const todayCount = rateSnap.docs.filter(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts >= todayStart
      }).length
      if (todayCount >= 5) {
        setRateError(t('map.train_rate_limit'))
        setSaving(false)
        return
      }
      const payload = {
        name:            name.trim(),
        description:     desc.trim(),
        timeStart:       fmt(date, start),
        timeEnd:         fmt(date, end),
        location:        park.name,
        authorId:        uid,
        authorName:      userName,
        authorCoach:     false,
        authorAdmin:     false,
        official:        false,
        reminderMinutes: 30,
        rsvps:           { [uid]: 'GOING' },
        rsvpNames:       { [uid]: userName },
        exercises:       [],
        createdAt:       serverTimestamp(),
      }
      // Parks linked to a community → save to the community's trainings collection
      // so the training appears in both the community history and the map's upcoming list.
      // Standalone parks → save to the park's own trainings collection.
      const trainingsCol = park.communityId
        ? collection(db, 'communities', park.communityId, 'trainings')
        : collection(db, 'parks', park.id, 'trainings')
      const ref = await addDoc(trainingsCol, payload)
      // Increment the park's upcoming training counter so the pin turns green
      await updateDoc(doc(db, 'parks', park.id), { upcomingTrainingCount: increment(1) })
      onAdded({ id: ref.id, ...payload, createdAt: null } as unknown as PlannedTraining)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-blue-500/50 transition-colors"

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-black text-white">{t('map.train_modal_title')}</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">{park.name}</p>
        <div className="flex flex-col gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('map.train_name_placeholder')}
            maxLength={120} className={inputCls} />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('map.train_desc_placeholder')}
            maxLength={1000} className={inputCls} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <input type="time" value={start} onChange={e => setStart(e.target.value)}
              className={`flex-1 min-w-0 ${inputCls}`} />
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
              className={`flex-1 min-w-0 ${inputCls}`} />
          </div>
          {rateError && <p className="text-xs text-red-400 text-center">{rateError}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60">{t('map.cancel')}</button>
            <button onClick={save} disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-xl text-black text-sm font-black disabled:opacity-40"
              style={{ backgroundColor: '#1ED75F' }}>
              {saving ? '...' : t('map.save')}
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
