'use client'

import { useCallback, useRef, useState } from 'react'
import { useT } from '@/lib/context/LanguageContext'
import { useBattleAudio } from '@/lib/battle/useBattleAudio'
import { isRepValid } from '@/lib/battle/anti-cheat'
import type { BattleExerciseType } from '@/lib/battle/types'

interface Props {
  reps: number
  exerciseType: BattleExerciseType | null
  onIncrement: (newCount: number) => void
}

export default function ManualRepButton({ reps, exerciseType, onIncrement }: Props) {
  const t = useT()
  const { playRepBeep, vibrate } = useBattleAudio()
  const lastTapRef = useRef<number | null>(null)
  const [pressing, setPressing] = useState(false)

  const handleTap = useCallback(() => {
    if (!isRepValid(exerciseType, lastTapRef.current)) return
    lastTapRef.current = Date.now()

    const newCount = reps + 1
    onIncrement(newCount)
    playRepBeep()
    vibrate(15)

    setPressing(true)
    setTimeout(() => setPressing(false), 150)
  }, [reps, exerciseType, onIncrement, playRepBeep, vibrate])

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Large tap button */}
      <button
        onPointerDown={handleTap}
        className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-transform select-none touch-none ${
          pressing ? 'scale-90' : 'scale-100'
        }`}
        style={{
          backgroundColor: 'rgba(var(--accent-rgb), 0.12)',
          border: '3px solid rgba(var(--accent-rgb), 0.3)',
          boxShadow: pressing ? '0 0 30px rgba(var(--accent-rgb), 0.3)' : '0 0 15px rgba(var(--accent-rgb), 0.1)',
        }}
      >
        {/* Pulsing ring */}
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            border: '2px solid rgba(var(--accent-rgb), 0.15)',
            animationDuration: '2s',
          }}
        />
        {/* Rep count */}
        <span className="text-5xl font-black text-white/95">{reps}</span>
      </button>

      <p className="text-sm text-white/40">{t('battle.tap_to_count')}</p>
    </div>
  )
}
