'use client'

import { useEffect, useState, useRef } from 'react'
import { useT } from '@/lib/context/LanguageContext'
import { COUNTDOWN_DURATION_MS } from '@/lib/event/types'

interface Props {
  onComplete: () => void
}

const COLORS = ['#FACC15', '#F97316', '#EF4444', '#F59E0B', '#1ED75F']
const TOTAL_SECONDS = Math.ceil(COUNTDOWN_DURATION_MS / 1000)

export default function EventCountdown({ onComplete }: Props) {
  const t = useT()
  const [count, setCount] = useState(TOTAL_SECONDS)
  const completedRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          if (!completedRef.current) {
            completedRef.current = true
            setTimeout(onComplete, 600)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onComplete])

  const label = count === 0 ? t('event.go') : String(count)
  const colorIndex = count === 0 ? COLORS.length - 1 : Math.min(count - 1, COLORS.length - 2)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div
        key={count}
        className="text-center animate-[popIn_0.35s_cubic-bezier(0.34,1.56,0.64,1)]"
      >
        <span
          className="text-[120px] font-black leading-none"
          style={{ color: COLORS[colorIndex] }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
