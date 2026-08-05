'use client'

import { Check, Camera, WifiOff, Bot } from 'lucide-react'
import type { BattlePlayerDoc } from '@/lib/battle/types'
import { isBotUid } from '@/lib/bots/bot-profiles'

interface Props {
  player: BattlePlayerDoc
  isCurrentUser?: boolean
  showReadyState?: boolean
  colorIndex?: number
  onToggleReady?: () => void
}

export default function BattlePlayerCard({ player, isCurrentUser, showReadyState = true, onToggleReady }: Props) {
  const isBot = isBotUid(player.uid)

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
        isCurrentUser ? 'border border-[var(--accent)]/20' : 'border border-white/6'
      }`}
      style={{ backgroundColor: isCurrentUser ? 'rgba(var(--accent-rgb), 0.05)' : 'rgba(255,255,255,0.03)' }}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
        {player.photoUrl ? (
          <img src={player.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/50">
            {player.displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-white/85 truncate block">
          {player.displayName}
          {isCurrentUser && <span className="text-xs text-white/40 ml-1">(tu)</span>}
        </span>
      </div>

      {/* Connection status */}
      {!player.isConnected && (
        <WifiOff size={14} className="text-red-400/60 flex-shrink-0" />
      )}

      {/* Camera / Bot badge */}
      {isBot ? (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-[10px] font-bold text-purple-400 flex-shrink-0">
          <Bot size={12} />BOT
        </span>
      ) : (
        <Camera size={14} className="text-green-400/60 flex-shrink-0" />
      )}

      {/* Ready state */}
      {showReadyState && (
        onToggleReady ? (
          <button
            onClick={onToggleReady}
            className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ${
              player.isReady ? 'bg-green-500/20' : 'bg-white/5 border border-white/10 hover:border-white/20'
            }`}
          >
            {player.isReady && <Check size={14} className="text-green-400" />}
          </button>
        ) : (
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
            player.isReady ? 'bg-green-500/20' : 'bg-white/5 border border-white/10'
          }`}>
            {player.isReady && <Check size={14} className="text-green-400" />}
          </div>
        )
      )}
    </div>
  )
}
