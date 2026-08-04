'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Share2, UserPlus, Clock } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import { useToast } from '@/lib/context/ToastContext'
import type { EventDoc, EventParticipantDoc } from '@/lib/event/types'
import InviteToEventSheet from './InviteToEventSheet'

interface Props {
  event: EventDoc
  participants: EventParticipantDoc[]
  isHost: boolean
  onStart: () => void
  onCancel: () => void
  onLeave: () => void
  currentUid: string
}

export default function EventLobby({
  event, participants, isHost,
  onStart, onCancel, onLeave, currentUid,
}: Props) {
  const t = useT()
  const { showToast } = useToast()
  const [showInvite, setShowInvite] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const emptySlots = event.maxParticipants - participants.length
  const canStart = participants.length >= 2 && isHost

  async function handleCopy() {
    await navigator.clipboard.writeText(event.code)
    showToast(t('event.copied'), 'success')
  }

  async function handleShare() {
    const url = `${window.location.origin}/event/${event.id}`
    if (navigator.share) {
      await navigator.share({ title: event.name, text: `Eveniment: ${event.name}`, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url)
      showToast(t('event.copied'), 'success')
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      {/* Event name */}
      <h2 className="text-xl font-black text-white/90 text-center mb-1">{event.name}</h2>
      {event.description && (
        <p className="text-sm text-white/45 text-center mb-4">{event.description}</p>
      )}

      {/* Room code */}
      <div className="text-center mb-4">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{t('event.room_code')}</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl font-black tracking-[0.25em] text-white/95 font-mono">{event.code}</span>
          <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Copy size={18} className="text-white/50" />
          </button>
          <button onClick={handleShare} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <Share2 size={18} className="text-white/50" />
          </button>
        </div>
      </div>

      {/* QR Code toggle */}
      <div className="text-center mb-4">
        <button
          onClick={() => setShowQR(q => !q)}
          className="text-xs font-medium text-amber-400/70 hover:text-amber-400 transition-colors"
        >
          {showQR ? '▲ ' : '▼ '}{t('event.qr_code')}
        </button>
        {showQR && (
          <div className="mt-3 inline-block p-4 rounded-2xl bg-white">
            <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/event/${event.id}`} size={160} />
          </div>
        )}
      </div>

      {/* Exercise rules */}
      <div className="mb-5 p-3 rounded-xl border border-white/8" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
        <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('event.exercises').toUpperCase()}</p>
        {event.exercises.map(ex => (
          <div key={ex.name} className="flex items-center justify-between py-1.5">
            <span className="text-sm text-white/80">{ex.name}</span>
            <span className="text-xs font-bold text-amber-400">{ex.pointsPerRep} {t('event.points')}/rep</span>
          </div>
        ))}
        {event.durationMinutes ? (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/6">
            <Clock size={12} className="text-white/40" />
            <span className="text-xs text-white/50">{event.durationMinutes} {t('event.minutes')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/6">
            <Clock size={12} className="text-white/40" />
            <span className="text-xs text-white/50">{t('event.open_ended')}</span>
          </div>
        )}
      </div>

      {/* Scheduled time */}
      {event.scheduledAt && (
        <div className="text-center mb-4">
          <p className="text-xs text-white/40">
            {t('event.scheduled_for')}: {event.scheduledAt.toDate().toLocaleString()}
          </p>
        </div>
      )}

      {/* Participant list */}
      <div className="space-y-1.5 mb-6">
        {participants.map(p => (
          <div
            key={p.uid}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
              p.uid === currentUid ? 'border-amber-400/20' : 'border-white/6'
            }`}
            style={{
              backgroundColor: p.uid === currentUid ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.03)',
            }}
          >
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/50">
                  {p.displayName.charAt(0)}
                </div>
              )}
            </div>
            <span className="flex-1 text-sm font-medium text-white/85 truncate">{p.displayName}</span>
            {p.uid === currentUid && <span className="text-xs text-white/40">(tu)</span>}
            {p.uid === event.hostUid && <span className="text-[10px] font-bold text-amber-400/60 uppercase">Host</span>}
          </div>
        ))}
        {Array.from({ length: Math.min(emptySlots, 5) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-white/8"
            style={{ backgroundColor: 'rgba(255,255,255,0.01)' }}
          >
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
              <UserPlus size={14} className="text-white/20" />
            </div>
            <span className="text-sm text-white/25">
              {t('event.free_slot')} ({participants.length + i + 1}/{event.maxParticipants})
            </span>
          </div>
        ))}
        {emptySlots > 5 && (
          <p className="text-xs text-white/30 text-center">+{emptySlots - 5} {t('event.free_slot')}</p>
        )}
      </div>

      {/* Invite Friends */}
      <button
        onClick={() => setShowInvite(true)}
        className="w-full mb-3 h-10 rounded-xl border border-white/10 text-sm font-medium text-white/70 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
      >
        <UserPlus size={16} />
        {t('event.invite_friends')}
      </button>

      {/* Start / Cancel / Leave */}
      {isHost ? (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded-xl border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/5 transition-all"
          >
            {t('event.cancel')}
          </button>
          <button
            onClick={onStart}
            disabled={!canStart}
            className="flex-[2] h-9 rounded-xl font-bold text-sm text-black transition-all active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {t('event.start')}
          </button>
        </div>
      ) : (
        <button
          onClick={onLeave}
          className="w-full h-11 rounded-xl border border-white/10 text-sm font-medium text-white/50 hover:bg-white/5 transition-all"
        >
          {t('event.leave')}
        </button>
      )}

      {!canStart && participants.length < 2 && (
        <p className="text-xs text-white/30 text-center mt-3">{t('event.waiting')}</p>
      )}

      {showInvite && (
        <InviteToEventSheet eventId={event.id} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
