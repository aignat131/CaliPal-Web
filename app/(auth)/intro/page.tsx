'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const slides = [
  {
    title: 'Bine ai venit în CaliPal',
    description: 'Aplicația ta de calisthenics — înregistrează antrenamente și conectează-te cu o comunitate de atleți care se antrenează ca tine.',
    emoji: '💪',
    pill: 'Calisthenics & Street Workout',
    gradientFrom: '#0F0F0F',
    gradientTo: '#1A2A1A',
    accent: '#1DB954',
  },
  {
    title: 'AI numără și analizează forma',
    description: 'Numără rep-urile și îți spune dacă ai genunchii îndoiți, picioarele prea în față sau dacă mișcarea este incompletă.',
    emoji: '🤖',
    pill: 'MediaPipe + TFLite',
    gradientFrom: '#0A0A1A',
    gradientTo: '#1A1040',
    accent: '#7B61FF',
  },
  {
    title: 'Antrenor personal în aplicație',
    description: 'Găsește un mentor verificat, cere feedback pe forma ta și urmează un plan personalizat. Dacă ești coach, poți gestiona atleți direct din aplicație.',
    emoji: '🎯',
    pill: 'Coaching & Mentorship',
    gradientFrom: '#001A1A',
    gradientTo: '#003333',
    accent: '#00D4AA',
  },
  {
    title: 'Comunitate & locuri de antrenament',
    description: 'Conectează-te cu alți atleți, urmărește-le progresul și găsește parcuri cu bare de tracțiuni în apropierea ta direct pe hartă. Vezi în timp real cine este la același loc.',
    emoji: '🗺️',
    pill: 'Comunitate + Maps',
    gradientFrom: '#1A0A00',
    gradientTo: '#3A1400',
    accent: '#FF6B2B',
  },
  {
    title: 'Istoricul tău de antrenamente',
    description: 'Toate sesiunile tale sunt salvate. Revezi fiecare antrenament cu numărul de rep-uri, clasificarea formei și clipurile video aferente.',
    emoji: '📊',
    pill: 'Istoric & statistici',
    gradientFrom: '#1A001A',
    gradientTo: '#330033',
    accent: '#E91E8C',
  },
]

export default function IntroPage() {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [animating, setAnimating] = useState(false)

  const slide = slides[current]

  function finish() {
    localStorage.setItem('calipal_intro_done', '1')
    router.replace('/login')
  }

  function goTo(index: number) {
    if (animating || index === current) return
    setAnimating(true)
    setTimeout(() => {
      setCurrent(index)
      setAnimating(false)
    }, 200)
  }

  function next() {
    if (current < slides.length - 1) goTo(current + 1)
    else finish()
  }

  function prev() {
    if (current > 0) goTo(current - 1)
  }

  // Keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="min-h-screen flex flex-col transition-all duration-500 ease-in-out"
      style={{ background: `linear-gradient(135deg, ${slide.gradientFrom}, ${slide.gradientTo})` }}
    >
      {/* Ambient blobs */}
      <div
        className="absolute w-64 h-64 -top-16 -left-16 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${slide.accent}55, transparent 70%)`, transition: 'background 0.5s' }}
      />
      <div
        className="absolute w-72 h-72 -bottom-16 -right-16 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${slide.accent}40, transparent 70%)`, transition: 'background 0.5s' }}
      />

      <div className="relative flex flex-col flex-1 px-7 pt-14 pb-10 max-w-lg mx-auto w-full">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-auto">
          <span className="text-xs font-black text-white/90 tracking-[2px]">CALIPAL</span>
          <button onClick={finish} className="text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">
            Skip
          </button>
        </div>

        {/* Slide content */}
        <div
          className="flex-1 flex flex-col justify-center py-8 transition-opacity duration-200"
          style={{ opacity: animating ? 0 : 1 }}
        >
          {/* Icon circle */}
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center mb-8"
            style={{ backgroundColor: `${slide.accent}26` }}
          >
            <span className="text-5xl">{slide.emoji}</span>
          </div>

          {/* Counter */}
          <span className="text-[11px] font-semibold text-white/40 tracking-[2px] mb-2">
            {String(current + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>

          <h1 className="text-3xl font-black text-white leading-tight tracking-tight mb-3">
            {slide.title}
          </h1>

          <p className="text-[15px] text-white/72 leading-relaxed mb-5">
            {slide.description}
          </p>

          {/* Pill */}
          <span
            className="self-start px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide"
            style={{ backgroundColor: `${slide.accent}33`, color: slide.accent, transition: 'all 0.5s' }}
          >
            {slide.pill}
          </span>
        </div>

        {/* Dots */}
        <div className="flex items-center gap-1.5 mb-5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: i === current ? '24px' : '4px',
                backgroundColor: i === current ? slide.accent : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div className="flex gap-2.5">
          <button
            onClick={prev}
            disabled={current === 0}
            className="w-13 h-13 rounded-full flex items-center justify-center text-lg transition-colors disabled:opacity-20"
            style={{
              width: 52, height: 52,
              backgroundColor: current > 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
              color: current > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
            }}
          >
            ←
          </button>

          <button
            onClick={next}
            className="flex-1 h-13 rounded-full font-extrabold text-[15px] tracking-wide transition-colors"
            style={{
              height: 52,
              backgroundColor: current === slides.length - 1 ? slide.accent : '#FFFFFF',
              color: current === slides.length - 1 ? '#FFFFFF' : '#111111',
            }}
          >
            {current < slides.length - 1 ? 'Continuă →' : 'Începe acum →'}
          </button>
        </div>
      </div>
    </div>
  )
}
