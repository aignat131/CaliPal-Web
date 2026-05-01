'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const slides = [
  {
    title: 'Bine ai venit în CaliPal',
    description: 'Aplicația ta de calisthenics — înregistrează antrenamente și conectează-te cu o comunitate de atleți care se antrenează ca tine.',
    emoji: '💪',
    pill: 'Calisthenics & Street Workout',
    gradientFrom: '#0F0F0F',
    gradientTo: '#1A2A1A',
    accent: '#1ED75F',
  },
  {
    title: 'Comunitate & locuri de antrenament',
    description: 'Conectează-te cu alți atleți și găsește parcuri cu bare de tracțiuni în apropierea ta direct pe hartă. Vezi în timp real cine este la același loc.',
    emoji: '🗺️',
    pill: 'Comunitate + Maps',
    gradientFrom: '#1A0A00',
    gradientTo: '#3A1400',
    accent: '#FF6B2B',
  },
  {
    title: 'Ești gata?',
    description: 'Explorează parcuri, comunități și antrenamente. Contul îți deblochează tot.',
    emoji: '🏃',
    pill: 'Începe',
    gradientFrom: '#0F0F0F',
    gradientTo: '#1A2A1A',
    accent: '#1ED75F',
  },
]

export default function IntroPage() {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [animating, setAnimating] = useState(false)

  const slide = slides[current]
  const isLast = current === slides.length - 1

  useEffect(() => {
    if (localStorage.getItem('calipal_intro_done')) router.replace('/home')
  }, [router])

  const finish = useCallback(() => {
    localStorage.setItem('calipal_intro_done', '1')
  }, [])

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
  }

  function prev() {
    if (current > 0) goTo(current - 1)
  }

  // Auto-advance (cleared on user interaction)
  useEffect(() => {
    if (isLast) return
    const t = setTimeout(() => next(), 4000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, isLast])

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
          <button
            onClick={() => { finish(); router.replace('/home') }}
            className="text-xs font-semibold text-white/50 hover:text-white/80 transition-colors"
          >
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
        {isLast ? (
          /* Last slide: two CTAs */
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => { finish(); router.replace('/login') }}
              className="w-full h-13 rounded-full font-extrabold text-[15px] tracking-wide transition-colors"
              style={{ height: 52, backgroundColor: slide.accent, color: '#111' }}
            >
              Intră în cont →
            </button>
            <button
              onClick={() => { finish(); router.replace('/home') }}
              className="w-full h-13 rounded-full font-semibold text-[15px] tracking-wide transition-colors"
              style={{ height: 52, backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}
            >
              Explorează mai întâi
            </button>
          </div>
        ) : (
          /* Other slides: prev + next */
          <div className="flex gap-2.5">
            <button
              onClick={prev}
              disabled={current === 0}
              className="rounded-full flex items-center justify-center text-lg transition-colors disabled:opacity-20"
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
              className="flex-1 rounded-full font-extrabold text-[15px] tracking-wide transition-colors"
              style={{ height: 52, backgroundColor: '#FFFFFF', color: '#111111' }}
            >
              Continuă →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
