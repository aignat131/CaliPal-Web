'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'
import {
  collection, onSnapshot, doc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, query, where,
} from 'firebase/firestore'

import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useTheme } from '@/lib/hooks/useTheme'
import { useT } from '@/lib/context/LanguageContext'
import type { ParkDoc, ParkPresenceMember, CommunityDoc, LocationSharingMode, ParkCommunityRequest, PlannedTraining, CommunityMember } from '@/types'
import { MapPin, Navigation } from 'lucide-react'
import {
  MapContainer, TileLayer, Marker, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ParkRequestModal from '@/components/map/ParkRequestModal'
import { parseMapTrainingDate } from '@/components/map/parseMapTrainingDate'
import { LocationPermissionSheet, MapOnboardingSheet } from '@/components/map/MapSheets'
import { ParkBottomSheet } from '@/components/map/ParkBottomSheet'

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
      aria-label="Recenter map"
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
  const { user, isSuperAdmin } = useAuth()
  const { displayName: myDisplayName, photoUrl: myPhoto } = useMyProfile()
  const { theme } = useTheme()
  const t = useT()

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
  const [isFlySearch, setIsFlySearch] = useState(false)
  const [parksLoading, setParksLoading] = useState(true)
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
  }, [user, locationSharingMode, myDisplayName, myPhoto])

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
      .finally(() => setParksLoading(false))
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
    if (search && !isFlySearch && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.city?.toLowerCase().includes(search.toLowerCase())) return false
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
                setIsFlySearch(false)
                setShowSuggestions(true)
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                if (q.trim().length > 2) {
                  searchDebounceRef.current = setTimeout(async () => {
                    try {
                      const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=ro&accept-language=ro`,
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
              className="w-full h-10 rounded-xl px-4 pr-9 text-sm outline-none backdrop-blur-sm focus:border-brand-green/50 transition-colors"
              style={{
                backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(13,46,43,0.92)',
                border: '1px solid rgba(128,128,128,0.25)',
                color: theme === 'light' ? '#0D1B1A' : '#fff',
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setIsFlySearch(false) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-xs"
                style={{ backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)', color: theme === 'light' ? '#333' : '#ccc' }}
              >
                ✕
              </button>
            )}
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
                      setIsFlySearch(true)
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

      {/* Parks loading indicator */}
      {parksLoading && (
        <div
          className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-4 py-2 rounded-full shadow-lg"
          style={{
            backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(13,46,43,0.92)',
            border: '1px solid rgba(128,128,128,0.2)',
          }}
        >
          <div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium" style={{ color: theme === 'light' ? '#0D1B1A' : 'rgba(255,255,255,0.7)' }}>
            {t('map.loading_parks')}
          </span>
        </div>
      )}

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
