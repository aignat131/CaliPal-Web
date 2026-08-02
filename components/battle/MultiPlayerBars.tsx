'use client'

import type { BattlePlayerDoc } from '@/lib/battle/types'
import { PLAYER_COLORS } from '@/lib/battle/types'
import { WifiOff } from 'lucide-react'

interface Props {
  sortedPlayers: BattlePlayerDoc[]
  currentUid: string
  targetReps?: number | null
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function MultiPlayerBars({ sortedPlayers, currentUid, targetReps }: Props) {
  const maxReps = targetReps ?? Math.max(1, sortedPlayers[0]?.reps ?? 1)

  return (
    <div className="px-4 pt-3">
      {/* Progress bars */}
      <div className="space-y-2 mb-4">
        {sortedPlayers.map((player, index) => {
          const color = PLAYER_COLORS[index % PLAYER_COLORS.length]
          const fillPct = Math.min(100, (player.reps / maxReps) * 100)
          const isMe = player.uid === currentUid

          return (
            <div
              key={player.uid}
              className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
                isMe ? 'border border-[var(--accent)]/20' : 'border border-transparent'
              }`}
              style={isMe ? { backgroundColor: 'rgba(var(--accent-rgb), 0.04)' } : {}}
            >
              {/* Rank */}
              <span className="w-5 text-center text-xs font-bold" style={{ color }}>
                {index < 3 ? MEDALS[index] : `${index + 1}`}
              </span>

              {/* Avatar */}
              <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
                {player.photoUrl ? (
                  <img src={player.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color }}>
                    {player.displayName.charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-medium text-white/75 truncate">{player.displayName}</span>
                  {!player.isConnected && <WifiOff size={10} className="text-red-400/60 flex-shrink-0" />}
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: `${color}15` }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${fillPct}%`, backgroundColor: color }}
                  />
                </div>
              </div>

              {/* Rep count */}
              <span className="text-sm font-black w-8 text-right" style={{ color }}>
                {player.reps}
              </span>
            </div>
          )
        })}
      </div>

      {/* Compact leaderboard card (bottom-left, only if 4+ players) */}
      {sortedPlayers.length >= 4 && (
        <div
          className="fixed bottom-24 left-4 md:left-20 lg:left-52 z-30 rounded-xl p-2.5 backdrop-blur-lg"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {sortedPlayers.slice(0, 3).map((p, i) => (
            <div key={p.uid} className="flex items-center gap-2 py-0.5">
              <span className="text-xs">{MEDALS[i]}</span>
              <span className="text-xs font-bold" style={{ color: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>
                {p.reps}
              </span>
              <span className="text-[10px] text-white/50 truncate max-w-[60px]">{p.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
