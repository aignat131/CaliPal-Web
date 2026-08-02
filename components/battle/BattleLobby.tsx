'use client'

import { useState } from 'react'
import { Copy, Share2, UserPlus } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import { useToast } from '@/lib/context/ToastContext'
import type { BattleDoc, BattlePlayerDoc } from '@/lib/battle/types'
import BattlePlayerCard from './BattlePlayerCard'
import InviteFriendsSheet from './InviteFriendsSheet'

interface Props {
  battle: BattleDoc
  players: BattlePlayerDoc[]
  myPlayer: BattlePlayerDoc | null
  isHost: boolean
  readyCount: number
  onToggleReady: () => void
  onStart: () => void
  onCancel: () => void
  onLeave: () => void
  currentUid: string
}

export default function BattleLobby({
  battle, players, myPlayer, isHost, readyCount,
  onToggleReady, onStart, onCancel, onLeave, currentUid,
}: Props) {
  const t = useT()
  const { showToast } = useToast()
  const [showInvite, setShowInvite] = useState(false)

  const emptySlots = battle.maxPlayers - players.length

  async function handleCopy() {
    await navigator.clipboard.writeText(battle.code)
    showToast(t('battle.copied'), 'success')
  }

  async function handleShare() {
    const url = `${window.location.origin}/battle/${battle.id}`
    if (navigator.share) {
      await navigator.share({ title: t('battle.title'), text: `Luptă: ${battle.exercise}`, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url)
      showToast(t('battle.copied'), 'success')
    }
  }

  const canStart = readyCount >= 2 && isHost

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      {/* Room code */}
      <div className="text-center mb-6">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{t('battle.room_code')}</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl font-black tracking-[0.25em] text-white/95 font-mono">{battle.code}</span>
          <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Copy size={18} className="text-white/50" />
          </button>
          <button onClick={handleShare} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Share2 size={18} className="text-white/50" />
          </button>
        </div>
        <p className="text-xs text-white/45 mt-2">
          {battle.exercise} · {battle.gameMode === 'TIME_ATTACK' ? `${battle.timeLimitSeconds}s` : `${battle.targetReps} rep`} · Max {battle.maxPlayers}
        </p>
      </div>

      {/* Player list */}
      <div className="space-y-1.5 mb-6">
        {players.map(p => (
          <BattlePlayerCard
            key={p.uid}
            player={p}
            isCurrentUser={p.uid === currentUid}
            onToggleReady={p.uid === currentUid ? onToggleReady : undefined}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-white/8"
            style={{ backgroundColor: 'rgba(255,255,255,0.01)' }}
          >
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
              <UserPlus size={14} className="text-white/20" />
            </div>
            <span className="text-sm text-white/25">{t('battle.free_slot')} ({players.length + i + 1}/{battle.maxPlayers})</span>
          </div>
        ))}
      </div>

      {/* Invite Friends */}
      <button
        onClick={() => setShowInvite(true)}
        className="w-full mb-3 h-10 rounded-xl border border-white/10 text-sm font-medium text-white/70 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
      >
        <UserPlus size={16} />
        {t('battle.invite_friends')}
      </button>

      {/* Ready toggle */}
      {myPlayer && (
        <button
          onClick={onToggleReady}
          className={`w-full mb-3 h-11 rounded-xl font-semibold text-sm transition-all active:scale-[0.97] ${
            myPlayer.isReady
              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
              : 'border border-white/15 text-white/70 hover:bg-white/5'
          }`}
        >
          {myPlayer.isReady ? `✅ ${t('battle.ready')}` : t('battle.ready')}
        </button>
      )}

      {/* Start / Cancel / Leave */}
      {isHost ? (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/5 transition-all"
          >
            {t('battle.cancel')}
          </button>
          <button
            onClick={onStart}
            disabled={!canStart}
            className="flex-[2] h-11 rounded-xl font-bold text-black transition-all active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('battle.start')}
          </button>
        </div>
      ) : (
        <button
          onClick={onLeave}
          className="w-full h-11 rounded-xl border border-white/10 text-sm font-medium text-white/50 hover:bg-white/5 transition-all"
        >
          {t('battle.leave')}
        </button>
      )}

      {!canStart && players.length < 2 && (
        <p className="text-xs text-white/30 text-center mt-3">{t('battle.waiting')}</p>
      )}
      {!canStart && players.length >= 2 && readyCount < 2 && (
        <p className="text-xs text-white/30 text-center mt-3">{t('battle.need_ready')}</p>
      )}

      {showInvite && (
        <InviteFriendsSheet battleId={battle.id} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
