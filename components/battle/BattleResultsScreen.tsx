'use client'

import { useEffect, useRef } from 'react'
import { Trophy, RotateCcw, Home, Bot } from 'lucide-react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useT } from '@/lib/context/LanguageContext'
import { useBattleAudio } from '@/lib/battle/useBattleAudio'
import { PLAYER_COLORS } from '@/lib/battle/types'
import type { BattleDoc, BattlePlayerDoc } from '@/lib/battle/types'
import { isBotUid } from '@/lib/bots/bot-profiles'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  battle: BattleDoc
  sortedPlayers: BattlePlayerDoc[]
  myPlayer: BattlePlayerDoc | null
  currentUid: string
  onRematch: () => void
  onHome: () => void
  onMarkFinished: (placement: number) => Promise<void>
}

export default function BattleResultsScreen({
  battle, sortedPlayers, myPlayer, currentUid,
  onRematch, onHome, onMarkFinished,
}: Props) {
  const t = useT()
  const { playFinish } = useBattleAudio()
  const processedRef = useRef(false)

  // Process results once: compute placement, write history
  useEffect(() => {
    if (processedRef.current || !myPlayer || myPlayer.finished) return
    processedRef.current = true

    async function processResults() {
      const placement = sortedPlayers.findIndex(p => p.uid === currentUid) + 1
      // Write battle history
      await addDoc(collection(db, 'users', currentUid, 'battle_history'), {
        battleId: battle.id,
        code: battle.code,
        exercise: battle.exercise,
        gameMode: battle.gameMode,
        reps: myPlayer!.reps,
        placement,
        playerCount: sortedPlayers.length,
        playedAt: serverTimestamp(),
      })

      // Mark finished in player doc
      await onMarkFinished(placement)

      playFinish()
    }

    processResults().catch(() => {})
  }, [myPlayer, sortedPlayers, currentUid, battle, onMarkFinished, playFinish])

  // Detect draw: top 2+ players have same reps
  const isDraw = sortedPlayers.length >= 2 && sortedPlayers[0].reps === sortedPlayers[1].reps

  return (
    <div className="max-w-md mx-auto px-4 py-8 animate-[fadeInUp_0.3s_ease-out]">
      {/* Header */}
      <div className="text-center mb-8">
        <Trophy size={40} style={{ color: 'var(--accent)' }} className="mx-auto mb-3" />
        <h1 className="text-2xl font-black text-white/90">
          {isDraw ? t('battle.draw') : t('battle.results')}
        </h1>
        <p className="text-sm text-white/45 mt-1">{battle.exercise}</p>
      </div>

      {/* Rankings */}
      <div className="space-y-2 mb-6">
        {sortedPlayers.map((player, index) => {
          const isMe = player.uid === currentUid
          const color = PLAYER_COLORS[index % PLAYER_COLORS.length]
          const isWinner = index === 0

          return (
            <div
              key={player.uid}
              className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${
                isWinner
                  ? 'border-2'
                  : isMe
                    ? 'border border-[var(--accent)]/20'
                    : 'border border-white/6'
              }`}
              style={{
                backgroundColor: isWinner
                  ? 'rgba(var(--accent-rgb), 0.08)'
                  : isMe
                    ? 'rgba(var(--accent-rgb), 0.04)'
                    : 'rgba(255,255,255,0.03)',
                borderColor: isWinner ? 'var(--accent)' : undefined,
              }}
            >
              {/* Medal / rank */}
              <div className="w-10 text-center flex-shrink-0">
                {index < 3 ? (
                  <span className={`text-2xl ${isWinner ? 'text-3xl' : ''}`}>{MEDALS[index]}</span>
                ) : (
                  <span className="text-lg font-bold text-white/40">#{index + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div className={`rounded-full overflow-hidden flex-shrink-0 bg-white/10 ${isWinner ? 'w-12 h-12' : 'w-10 h-10'}`}>
                {player.photoUrl ? (
                  <img src={player.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color }}>
                    {player.displayName.charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + badge */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold text-white/90 truncate ${isWinner ? 'text-base' : 'text-sm'}`}>
                    {player.displayName}
                  </span>
                  {isMe && <span className="text-xs text-white/40">(tu)</span>}
                  {isBotUid(player.uid) && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/15 text-[9px] font-bold text-purple-400">
                      <Bot size={10} />BOT
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/50 mt-0.5">{player.reps} {t('battle.reps')}</span>
              </div>

              {/* Rep count large */}
              <span className="text-xl font-black" style={{ color }}>{player.reps}</span>
            </div>
          )
        })}
      </div>


      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onRematch}
          className="flex-1 h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] text-black"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <RotateCcw size={16} />
          {t('battle.rematch')}
        </button>
        <button
          onClick={onHome}
          className="flex-1 h-11 rounded-xl border border-white/10 font-medium text-sm text-white/70 flex items-center justify-center gap-2 hover:bg-white/5 transition-all"
        >
          <Home size={16} />
          {t('battle.home')}
        </button>
      </div>
    </div>
  )
}
