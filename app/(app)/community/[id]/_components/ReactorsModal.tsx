'use client'

import { useState, useRef } from 'react'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import type { CommunityMember } from '@/types'
import { MemberAvatar } from './Avatars'

export function ReactorsModal({ emoji, reactionCounts, members, onClose }: {
  emoji: string
  reactionCounts: Record<string, string[]>
  members: CommunityMember[]
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
  const [tab, setTab] = useState(emoji)

  const memberMap = new Map(members.map(m => [m.userId, m]))
  const emojis = Object.keys(reactionCounts).filter(e => (reactionCounts[e]?.length ?? 0) > 0)
  const userIds = reactionCounts[tab] ?? []

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}>
      <div ref={panelRef}
        className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{ backgroundColor: 'var(--app-bg)', maxHeight: '60vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Emoji tabs */}
        <div className="flex gap-2 px-5 pb-3 overflow-x-auto">
          {emojis.map(e => (
            <button key={e} onClick={() => setTab(e)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex-shrink-0 ${
                tab === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
              }`}>
              {e} {reactionCounts[e].length}
            </button>
          ))}
        </div>

        {/* User list */}
        <div className="overflow-y-auto px-5 pb-6 flex flex-col gap-3">
          {userIds.map(uid => {
            const m = memberMap.get(uid)
            return (
              <div key={uid} className="flex items-center gap-3">
                <MemberAvatar photoUrl={m?.photoUrl} name={m?.displayName ?? '?'} size={32} />
                <span className="text-sm text-white font-semibold truncate">
                  {m?.displayName ?? 'Utilizator necunoscut'}
                </span>
              </div>
            )
          })}
          {userIds.length === 0 && (
            <p className="text-xs text-white/35 text-center py-4">Nicio reacție.</p>
          )}
        </div>
      </div>
    </div>
  )
}
