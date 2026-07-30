'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dumbbell, Users, MapPin, Trophy, ChevronRight, ChevronLeft } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

const slideKeys = [
  { icon: Dumbbell, titleKey: 'intro.slide1_title', descKey: 'intro.slide1_desc', color: '#1ED75F' },
  { icon: Users,    titleKey: 'intro.slide2_title', descKey: 'intro.slide2_desc', color: '#3B82F6' },
  { icon: MapPin,   titleKey: 'intro.slide3_title', descKey: 'intro.slide3_desc', color: '#F59E0B' },
  { icon: Trophy,   titleKey: 'intro.slide4_title', descKey: 'intro.slide4_desc', color: '#A855F7' },
]

export default function IntroPage() {
  const router = useRouter()
  const t = useT()
  const [current, setCurrent] = useState(0)

  function getRedirectUrl(): string {
    try { return sessionStorage.getItem('calipal_auth_redirect') ?? '/home' } catch { return '/home' }
  }

  function clearRedirect() {
    try { sessionStorage.removeItem('calipal_auth_redirect') } catch { /* */ }
  }

  function finish() {
    localStorage.setItem('calipal_intro_seen', '1')
    const redirect = getRedirectUrl()
    clearRedirect()
    router.replace(redirect)
  }

  function next() {
    if (current < slideKeys.length - 1) {
      setCurrent(current + 1)
    } else {
      finish()
    }
  }

  function skip() {
    finish()
  }

  const slide = slideKeys[current]
  const Icon = slide.icon
  const isLast = current === slideKeys.length - 1

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-between px-6 py-10"
      style={{ backgroundColor: 'var(--app-bg, #0D2E2B)' }}
    >
      {/* Skip */}
      <div className="w-full max-w-sm flex justify-end">
        {!isLast && (
          <button
            onClick={skip}
            className="text-sm text-white/40 hover:text-white/60 transition-colors py-1 px-2"
          >
            {t('intro.skip')}
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm w-full">
        <div
          className="w-28 h-28 rounded-3xl flex items-center justify-center mb-8 transition-all duration-500"
          style={{ backgroundColor: `${slide.color}18`, border: `2px solid ${slide.color}40` }}
        >
          <Icon size={48} style={{ color: slide.color }} strokeWidth={1.5} />
        </div>

        <h1
          className="text-3xl font-black text-white mb-3 text-center transition-all duration-500"
        >
          {t(slide.titleKey)}
        </h1>

        <p className="text-base text-white/55 text-center leading-relaxed max-w-xs transition-all duration-500">
          {t(slide.descKey)}
        </p>
      </div>

      {/* Bottom: dots + buttons */}
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Dot indicators */}
        <div className="flex gap-2">
          {slideKeys.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="transition-all duration-300"
              style={{
                width: i === current ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === current ? slide.color : 'rgba(255,255,255,0.2)',
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-3 w-full">
          {current > 0 && (
            <button
              onClick={() => setCurrent(current - 1)}
              className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:bg-white/12 transition-colors"
              aria-label={t('intro.skip')}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 h-12 rounded-2xl text-base font-black flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ backgroundColor: slide.color, color: '#000' }}
          >
            {isLast ? t('intro.start') : t('intro.next')}
            {!isLast && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
