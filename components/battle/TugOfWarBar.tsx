'use client'

import type { BattlePlayerDoc } from '@/lib/battle/types'
import { PLAYER_COLORS } from '@/lib/battle/types'

interface Props {
  player1: BattlePlayerDoc
  player2: BattlePlayerDoc
  currentUid: string
}

export default function TugOfWarBar({ player1, player2, currentUid }: Props) {
  const total = player1.reps + player2.reps
  // Split based on reps ratio, clamped to 15%–85% so both sides are always visible
  const p1Pct = total === 0 ? 50 : Math.min(85, Math.max(15, (player1.reps / total) * 100))

  // Determine which player is "you" and assign colors
  const isP1 = player1.uid === currentUid
  const leftColor = PLAYER_COLORS[0]  // green
  const rightColor = PLAYER_COLORS[1] // blue

  return (
    <div className="w-full px-4 pt-3 pb-2" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}>
      <div className="relative w-full h-14 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        {/* Left side (Player 1) */}
        <div
          className="absolute inset-y-0 left-0 flex items-center px-3 gap-2 transition-[width] duration-300 ease-out"
          style={{ width: `${p1Pct}%`, backgroundColor: `${leftColor}22` }}
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
            {player1.photoUrl ? (
              <img src={player1.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: leftColor }}>
                {player1.displayName.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-xs font-medium text-white/70 truncate">{player1.displayName}</span>
            <span className="text-lg font-black" style={{ color: leftColor }}>{player1.reps}</span>
          </div>
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/20 transition-[left] duration-300 ease-out z-10"
          style={{ left: `${p1Pct}%` }}
        />

        {/* Right side (Player 2) */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end px-3 gap-2 transition-[width] duration-300 ease-out"
          style={{ width: `${100 - p1Pct}%`, backgroundColor: `${rightColor}22` }}
        >
          <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
            <span className="text-lg font-black" style={{ color: rightColor }}>{player2.reps}</span>
            <span className="text-xs font-medium text-white/70 truncate">{player2.displayName}</span>
          </div>
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
            {player2.photoUrl ? (
              <img src={player2.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: rightColor }}>
                {player2.displayName.charAt(0)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
