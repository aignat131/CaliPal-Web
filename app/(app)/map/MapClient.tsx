'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'
import {
  collection, onSnapshot, doc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, query, where, addDoc, updateDoc, arrayUnion,
} from 'firebase/firestore'
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
        : `<path d="M17 19 L17 15 L20 13 L23 15 L23 19 M16 19 L24 19" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`}
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'community' | 'nocommunity'

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
  const [sharing, setSharing] = useState(false)
  const [liveLocations, setLiveLocations] = useState<Record<string, string>>({})
  const [showParkRequest, setShowParkRequest] = useState(false)
  const [locationSharingMode, setLocationSharingMode] = useState<LocationSharingMode>('EVERYWHERE')
  const [showParkCommModal, setShowParkCommModal] = useState(false)
  const [parkPendingReq, setParkPendingReq] = useState<ParkCommunityRequest | null>(null)
  const [todayTraining, setTodayTraining] = useState<PlannedTraining | null>(null)
  const [userAdminCommunities, setUserAdminCommunities] = useState<CommunityDoc[]>([])
  const watchIdRef = useRef<number | null>(null)

  // Permission sheet state
  const [showPermSheet, setShowPermSheet] = useState(false)
  const [permDenied, setPermDenied] = useState(false)

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

  // Load communities where the current user is ADMIN
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid)).then(async snap => {
      const ids: string[] = snap.data()?.joinedCommunityIds ?? []
      const results = await Promise.all(
        ids.map(id => getDoc(doc(db, 'communities', id)).then(s => s.exists() ? { id: s.id, ...s.data() } as CommunityDoc : null))
      )
      const adminComms: CommunityDoc[] = []
      await Promise.all(results.filter(Boolean).map(async c => {
        const mem = await getDoc(doc(db, 'communities', c!.id, 'members', user.uid))
        if (mem.exists() && mem.data().role === 'ADMIN') adminComms.push(c!)
      }))
      setUserAdminCommunities(adminComms)
    })
  }, [user])

  // Load parks
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'parks'), snap => {
      setParks(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkDoc))
    })
    return unsub
  }, [])

  // Sync fresh photoUrls from live_locations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'live_locations'), snap => {
      const map: Record<string, string> = {}
      snap.docs.forEach(d => { map[d.id] = (d.data().photoUrl as string) ?? '' })
      setLiveLocations(map)
    })
    return unsub
  }, [])

  // Load presence for all park communities
  useEffect(() => {
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
  }, [parks])

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
      setTodayTraining(null)
      setParkPendingReq(null)
      return
    }
    if (!selectedPark.communityId) {
      setParkCommunity(null)
      setParkPresenceMembers([])
      setTodayTraining(null)
      // Check for pending community request on this park
      if (user) {
        getDocs(query(
          collection(db, 'park_community_requests'),
          where('parkId', '==', selectedPark.id),
          where('status', '==', 'PENDING')
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
    })
    // Load today's training
    const today = new Date().toISOString().slice(0, 10)
    getDocs(query(
      collection(db, 'communities', selectedPark.communityId, 'trainings'),
      where('date', '==', today)
    )).then(snap => {
      setTodayTraining(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as PlannedTraining)
    })
    const unsub = onSnapshot(
      collection(db, 'park_presence', selectedPark.communityId, 'active_members'),
      snap => setParkPresenceMembers(snap.docs.map(d => d.data() as ParkPresenceMember))
    )
    return unsub
  }, [selectedPark, user])

  // Filter + search
  const filteredParks = parks.filter(p => {
    if (filter === 'community' && !p.communityId) return false
    if (filter === 'nocommunity' && p.communityId) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const centerLat = myLat ?? 45.9432
  const centerLng = myLng ?? 24.9668

  return (
    <div className="relative flex flex-col h-[calc(100vh-64px)] md:h-screen" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Location permission sheet */}
      {showPermSheet && (
        <LocationPermissionSheet
          onAllow={handleLocationAllow}
          onDeny={handleLocationDeny}
          denied={permDenied}
        />
      )}
      {/* Search + filter chips */}
      <div className="absolute top-0 left-0 right-0 z-[1000] px-3 pt-3 pb-2 pointer-events-none">
        <div className="pointer-events-auto">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Caută parc..."
            className="w-full h-10 rounded-xl px-4 text-sm outline-none backdrop-blur-sm focus:border-brand-green/50 transition-colors"
            style={{
              backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(13,46,43,0.92)',
              border: '1px solid rgba(128,128,128,0.25)',
              color: theme === 'light' ? '#0D1B1A' : '#fff',
            }}
          />
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
        </MapContainer>
      </div>

      {/* Location sharing FAB */}
      {locationSharingMode === 'OFF' ? (
        <div className="absolute bottom-4 left-4 z-[1000] h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg bg-white/10 border border-white/15 text-white/40">
          <Navigation size={14} />Locație oprită
        </div>
      ) : (
        <button
          onClick={() => {
            if (sharing) {
              stopSharing()
              localStorage.setItem(LOCATION_CONSENT_KEY, 'denied')
            } else {
              const stored = localStorage.getItem(LOCATION_CONSENT_KEY)
              if (stored === 'granted') {
                startSharing()
              } else {
                setPermDenied(false)
                setShowPermSheet(true)
              }
            }
          }}
          className={`absolute bottom-4 left-4 z-[1000] h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg transition-colors ${
            sharing
              ? 'bg-red-500/20 border border-red-500/40 text-red-400'
              : 'bg-brand-green text-black'
          }`}
        >
          {sharing
            ? <><span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />Oprește locația</>
            : <><Navigation size={14} />{locationSharingMode === 'FRIENDS_ONLY' ? 'Distribuie (prieteni)' : 'Distribuie locația'}</>}
        </button>
      )}

      {/* Request a park button */}
      <button
        onClick={() => setShowParkRequest(true)}
        className="absolute bottom-16 left-4 z-[1000] h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md"
        style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)' }}
      >
        <MapPin size={12} className="text-brand-green" /> Solicită un parc
      </button>

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
          todayTraining={todayTraining}
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
  uid, userName, todayTraining, parkPendingReq, userAdminCommunities,
  showParkCommModal, setShowParkCommModal, onPendingReqSet, onCommunityCreated,
}: {
  park: ParkDoc
  community: CommunityDoc | null
  members: ParkPresenceMember[]
  liveLocations: Record<string, string>
  onClose: () => void
  uid: string | null
  userName: string
  todayTraining: PlannedTraining | null
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
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center ml-3 flex-shrink-0"
        >
          <X size={14} className="text-white/70" />
        </button>
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

          {/* Today's training */}
          {todayTraining && (
            <div className="mt-2 p-3 rounded-xl border border-brand-green/20" style={{ backgroundColor: '#0D3D2820' }}>
              <p className="text-[9px] font-bold text-brand-green/70 tracking-widest mb-1">ANTRENAMENT AZI</p>
              <p className="text-sm font-bold text-white leading-tight">{todayTraining.name}</p>
              <p className="text-xs text-white/50 mt-0.5">
                {todayTraining.timeStart}{todayTraining.timeEnd ? `–${todayTraining.timeEnd}` : ''}
                {todayTraining.location ? ` · ${todayTraining.location}` : ''}
              </p>
              {(() => {
                const going = Object.values(todayTraining.rsvps ?? {}).filter(s => s === 'GOING').length
                return going > 0 ? (
                  <p className="text-xs text-brand-green mt-0.5">{going} {going === 1 ? 'merge' : 'merg'}</p>
                ) : null
              })()}
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
                    <p className="text-xs text-white/45">Pornește o comunitate pentru acest parc</p>
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
    })
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
      className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#1ED75F33' }}
    >
      {photoUrl && !imgError
        ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        : <span className="text-xs font-black text-brand-green">{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}
