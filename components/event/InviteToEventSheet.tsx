'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useT } from '@/lib/context/LanguageContext'
import { createNotification } from '@/lib/firebase/notifications'
import { X, Send, Check } from 'lucide-react'

interface FriendEntry {
  friendUid: string
  friendName: string
  friendPhotoUrl: string
}

interface Props {
  eventId: string
  onClose: () => void
}

export default function InviteToEventSheet({ eventId, onClose }: Props) {
  const { user } = useAuth()
  const t = useT()
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sentTo, setSentTo] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    getDocs(collection(db, 'users', user.uid, 'friends')).then(snap => {
      setFriends(snap.docs.map(d => d.data() as FriendEntry))
      setLoading(false)
    })
  }, [user])

  async function handleInvite(friend: FriendEntry) {
    if (!user || sentTo.has(friend.friendUid)) return
    await createNotification(
      friend.friendUid,
      'EVENT_INVITE',
      'Invitație la eveniment!',
      `${user.displayName ?? 'Cineva'} te invită la un eveniment!`,
      eventId,
      user.uid,
    )
    setSentTo(prev => new Set(prev).add(friend.friendUid))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[60vh] overflow-y-auto rounded-t-2xl p-5 animate-[slideUp_0.3s_ease-out]"
        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white/90">{t('event.invite_friends')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={20} className="text-white/50" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl skeleton" />)}
          </div>
        ) : friends.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-6">Nu ai prieteni adăugați încă</p>
        ) : (
          <div className="space-y-1.5">
            {friends.map(f => {
              const sent = sentTo.has(f.friendUid)
              return (
                <div key={f.friendUid} className="flex items-center gap-3 p-2.5 rounded-xl border border-white/6" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
                    {f.friendPhotoUrl ? (
                      <img src={f.friendPhotoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/50">
                        {f.friendName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="flex-1 text-sm font-medium text-white/85 truncate">{f.friendName}</span>
                  <button
                    onClick={() => handleInvite(f)}
                    disabled={sent}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      sent
                        ? 'bg-green-500/15 text-green-400'
                        : 'text-black active:scale-95'
                    }`}
                    style={!sent ? { backgroundColor: 'var(--accent)' } : {}}
                  >
                    {sent ? <Check size={14} /> : <Send size={14} />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
