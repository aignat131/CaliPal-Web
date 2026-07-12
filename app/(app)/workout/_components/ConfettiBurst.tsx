'use client'

import { useEffect, useState } from 'react'

const COLORS = ['#1ED75F', '#FFB800', '#60A5FA', '#F97316', '#A855F7', '#FB7185']
const PARTICLE_COUNT = 40

interface Particle {
  id: number
  x: number
  color: string
  size: number
  delay: number
  duration: number
  drift: number
}

export function ConfettiBurst() {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    setParticles(
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 4 + Math.random() * 6,
        delay: Math.random() * 0.5,
        duration: 1.5 + Math.random() * 1.5,
        drift: -20 + Math.random() * 40,
      }))
    )
  }, [])

  if (particles.length === 0) return null

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size * 1.4,
            backgroundColor: p.color,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
            transform: `translateX(${p.drift}px)`,
          }}
        />
      ))}
    </div>
  )
}
