'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dumbbell, Users, MapPin, Trophy, ChevronRight, ChevronLeft } from 'lucide-react'

const slides = [
  {
    icon: Dumbbell,
    title: 'Antrenamente',
    description: 'Inregistreaza antrenamentele, numara repetarile cu camera si urmareste-ti progresul.',
    color: '#1ED75F',
  },
  {
    icon: Users,
    title: 'Comunitate',
    description: 'Alatura-te unor grupuri de calisthenics, participa la antrenamente si conecteaza-te cu alti sportivi.',
    color: '#3B82F6',
  },
  {
    icon: MapPin,
    title: 'Harta',
    description: 'Gaseste parcuri de street workout in apropierea ta si descopera locuri noi.',
    color: '#F59E0B',
  },
  {
    icon: Trophy,
    title: 'Provocari',
    description: 'Castiga monede, debloca realizari si participa la provocari saptamanale.',
    color: '#A855F7',
  },
]

export default function IntroPage() {
  const router = useRouter()
  const [current, setCurrent] = useState(0)

  function next() {
    if (current < slides.length - 1) {
      setCurrent(current + 1)
    } else {
      localStorage.setItem('calipal_intro_seen', '1')
      router.replace('/home')
    }
  }

  function skip() {
    localStorage.setItem('calipal_intro_seen', '1')
    router.replace('/home')
  }

  const slide = slides[current]
  const Icon = slide.icon
  const isLast = current === slides.length - 1

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
            Sari peste
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
          {slide.title}
        </h1>

        <p className="text-base text-white/55 text-center leading-relaxed max-w-xs transition-all duration-500">
          {slide.description}
        </p>
      </div>

      {/* Bottom: dots + buttons */}
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Dot indicators */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
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
              aria-label="Inapoi"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 h-12 rounded-2xl text-base font-black flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ backgroundColor: slide.color, color: '#000' }}
          >
            {isLast ? 'Incepe' : 'Urmatorul'}
            {!isLast && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
