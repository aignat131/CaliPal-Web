'use client'

import { useState } from 'react'
import { useTheme } from '@/lib/hooks/useTheme'
import { useT } from '@/lib/context/LanguageContext'
import { Navigation, MapPin } from 'lucide-react'

// ── Location Permission Sheet ─────────────────────────────────────────────────

export function LocationPermissionSheet({
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

export function MapOnboardingSheet({
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
