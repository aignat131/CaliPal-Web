'use client'

import { useEffect, useRef } from 'react'
import type { Timestamp } from 'firebase/firestore'
import { useBattleTimer } from '@/lib/battle/useBattleTimer'
import { useBattleAudio } from '@/lib/battle/useBattleAudio'
import { useT } from '@/lib/context/LanguageContext'

interface Props {
  startAt: Timestamp
}

const COLORS = ['#FACC15', '#F97316', '#EF4444', '#1ED75F'] // 3=yellow, 2=orange, 1=red, GO=green
const LABELS = ['3', '2', '1', '']

export default function BattleCountdown({ startAt }: Props) {
  const t = useT()
  const { countdownNumber } = useBattleTimer('COUNTDOWN', startAt, 0)
  const { playTick, playGo, vibrate } = useBattleAudio()
  const lastPlayedRef = useRef<number | null>(null)

  useEffect(() => {
    if (countdownNumber === null || countdownNumber === lastPlayedRef.current) return
    lastPlayedRef.current = countdownNumber

    if (countdownNumber > 0) {
      playTick()
      vibrate(30)
    } else if (countdownNumber === 0) {
      playGo()
      vibrate([50, 30, 50])
    }
  }, [countdownNumber, playTick, playGo, vibrate])

  if (countdownNumber === null) return null

  const colorIndex = countdownNumber === 0 ? 3 : 3 - countdownNumber
  const label = countdownNumber === 0 ? t('battle.go') : LABELS[3 - countdownNumber]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div
        key={countdownNumber}
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
