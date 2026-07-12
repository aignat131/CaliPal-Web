'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useT } from '@/lib/context/LanguageContext'
import type { CommunityMember, MemberRole } from '@/types'
import { ROLE_LABELS } from '@/types'
import {
  MessageSquare, Check, Clock, UserPlus, User, Bell, X, UserX,
} from 'lucide-react'
import { ROLE_COLORS } from './shared'
import { RoleAvatar } from './Avatars'

// ── Join Notification Modal ───────────────────────────────────────────────────

export function JoinNotificationModal({
  communityName, onRequestNotifications, onDismiss,
}: {
  communityName: string
  onRequestNotifications: () => void
  onDismiss: () => void
}) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60" onClick={onDismiss}>
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-t-3xl p-6 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-end mb-1">
          <button onClick={onDismiss} aria-label="Închide" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)', border: '1px solid rgba(var(--accent-rgb), 0.19)' }}>
            <Bell size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">{t('community.joined_title', { name: communityName })}</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{t('community.joined_notif')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onRequestNotifications}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm"
          >
            {t('community.enable_notif')}
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-2xl text-white/45 text-sm font-semibold"
          >
            {t('community.no_thanks')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Member Sheet ─────────────────────────────────────────────────────────────

export function MemberSheet({
  member, myUid, isFriend, isPending, canKick,
  onClose, onGoToChat, onAddFriend, onKick,
}: {
  member: CommunityMember
  myUid: string
  isFriend: boolean
  isPending: boolean
  canKick: boolean
  onClose: () => void
  onGoToChat: () => void
  onAddFriend: () => void
  onKick: () => void
}) {
  const t = useT()
  const roleColor = ROLE_COLORS[member.role as MemberRole] ?? 'var(--accent)'
  const isMe = member.userId === myUid

  const joinedAtMs = member.joinedAt
    ? ((member.joinedAt as { toMillis?: () => number }).toMillis?.() ?? Date.now())
    : null
  const daysSinceJoin = joinedAtMs !== null
    ? Math.floor((Date.now() - joinedAtMs) / 86400000)
    : null

  function formatMemberDuration(days: number): string {
    if (days <= 1) return t('comm_detail.member_1day')
    if (days < 30) return t('comm_detail.member_days', { n: days })
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)
    const remainingMonths = Math.floor((days % 365) / 30)
    if (years === 0) {
      return months === 1 ? t('comm_detail.member_1month') : t('comm_detail.member_months', { n: months })
    }
    if (remainingMonths === 0) {
      return years === 1 ? t('comm_detail.member_1year') : t('comm_detail.member_years', { n: years })
    }
    return years === 1
      ? t('comm_detail.member_1year_months', { m: remainingMonths })
      : t('comm_detail.member_years_months', { y: years, m: remainingMonths })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-10 animate-slide-up"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-5" />

        {/* Avatar + name row */}
        <div className="flex flex-col items-center px-6 mb-6">
          <div className="relative mb-3">
            <RoleAvatar photoUrl={member.photoUrl || ''} name={member.displayName} roleColor={roleColor} size={64} />
            {member.role === 'ADMIN' && <span className="absolute -bottom-0.5 -right-0.5 text-base">👑</span>}
            {member.role === 'TRAINER' && <span className="absolute -bottom-0.5 -right-0.5 text-base">🏋️</span>}
          </div>
          <p className="text-lg font-black text-white">{member.displayName}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap justify-center">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
              style={{ backgroundColor: `${roleColor}20`, color: roleColor }}>
              {ROLE_LABELS[member.role as MemberRole]}
            </span>
            <span className="text-xs text-white/35">•</span>
            <span className="text-xs text-white/50">{member.trainingPoints ?? 0} pts</span>
            {daysSinceJoin !== null && (
              <>
                <span className="text-xs text-white/35">•</span>
                <span className="text-xs text-white/50">{formatMemberDuration(daysSinceJoin)}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 flex flex-col gap-2">
          {!isMe && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onGoToChat}
                className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', border: '1px solid rgba(var(--accent-rgb), 0.25)', color: 'var(--accent)' }}
              >
                <MessageSquare size={16} /> Mesaj
              </button>
              <Link href={`/profile/${member.userId}`} className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 bg-white/8 border border-white/12 text-white/80">
                <User size={16} /> Profil complet
              </Link>
            </div>
          )}
          {isMe && (
            <Link href="/profile" className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm bg-white/8 border border-white/12 text-white/80 active:scale-95 transition-transform">
              <User size={16} /> Profilul meu
            </Link>
          )}

          {!isMe && !isFriend && !isPending && (
            <button
              onClick={onAddFriend}
              className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm bg-white/8 border border-white/12 text-white/80 active:scale-95 transition-transform"
            >
              <UserPlus size={16} /> Adaugă prieten
            </button>
          )}
          {!isMe && isFriend && (
            <div className="h-10 flex items-center justify-center gap-2 text-sm text-brand-green">
              <Check size={15} /> Prieteni deja
            </div>
          )}
          {!isMe && isPending && (
            <div className="h-10 flex items-center justify-center gap-2 text-sm text-white/35">
              <Clock size={15} /> Cerere trimisă
            </div>
          )}

          {canKick && (
            <button
              onClick={onKick}
              className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-red-400 border border-red-400/20 bg-red-400/8 active:scale-95 transition-transform mt-1"
            >
              <UserX size={16} /> Elimină din comunitate
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
