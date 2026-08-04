'use client'

import { PLAYER_COLORS } from '@/lib/battle/types'
import { WifiOff } from 'lucide-react'
import type { EventParticipantDoc } from '@/lib/event/types'
import { useT } from '@/lib/context/LanguageContext'

interface Props {
  sortedParticipants: EventParticipantDoc[]
  currentUid: string
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function EventLeaderboard({ sortedParticipants, currentUid }: Props) {
  const t = useT()
  const maxPoints = Math.max(1, sortedParticipants[0]?.totalPoints ?? 1)

  return (
    <div className="space-y-2">
      {sortedParticipants.map((participant, index) => {
        const color = PLAYER_COLORS[index % PLAYER_COLORS.length]
        const fillPct = Math.min(100, (participant.totalPoints / maxPoints) * 100)
        const isMe = participant.uid === currentUid

        return (
          <div
            key={participant.uid}
            className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
              isMe ? 'border border-amber-400/20' : 'border border-transparent'
            }`}
            style={isMe ? { backgroundColor: 'rgba(251,191,36,0.04)' } : {}}
          >
            {/* Rank */}
            <span className="w-5 text-center text-xs font-bold" style={{ color }}>
              {index < 3 ? MEDALS[index] : `${index + 1}`}
            </span>

            {/* Avatar */}
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
              {participant.photoUrl ? (
                <img src={participant.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color }}>
                  {participant.displayName.charAt(0)}
                </div>
              )}
            </div>

            {/* Name + bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-medium truncate" style={{ color: participant.nameColor ?? 'rgba(255,255,255,0.75)' }}>
                  {participant.emojiBadge && <span className="mr-0.5">{participant.emojiBadge}</span>}
                  {participant.displayName}
                </span>
                {!participant.isConnected && <WifiOff size={10} className="text-red-400/60 flex-shrink-0" />}
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: `${color}15` }}>
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${fillPct}%`, backgroundColor: color }}
                />
              </div>
            </div>

            {/* Points */}
            <span className="text-sm font-black w-10 text-right" style={{ color }}>
              {participant.totalPoints}
            </span>
            <span className="text-[10px] text-white/30">{t('event.points')}</span>
          </div>
        )
      })}
    </div>
  )
}
