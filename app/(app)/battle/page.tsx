'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useT } from '@/lib/context/LanguageContext'
import { Swords, Plus, Hash, ChevronLeft, Trophy, Clock, Target } from 'lucide-react'
import { getRecoveredBattleId } from '@/lib/battle/useBattle'
import type { UserBattleHistory } from '@/lib/battle/types'
import CreateBattleSheet from '@/components/battle/CreateBattleSheet'
import JoinBattleSheet from '@/components/battle/JoinBattleSheet'

export default function BattlePage() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useT()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [history, setHistory] = useState<(UserBattleHistory & { id: string })[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Check for crash recovery
  useEffect(() => {
    const recovered = getRecoveredBattleId()
    if (recovered) router.replace(`/battle/${recovered}`)
  }, [router])

  // Load battle history
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'battle_history'),
      orderBy('playedAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserBattleHistory & { id: string })))
      setHistoryLoading(false)
    })
    return unsub
  }, [user])

  const handleCreated = (battleId: string) => {
    setShowCreate(false)
    router.push(`/battle/${battleId}`)
  }

  const handleJoined = (battleId: string) => {
    setShowJoin(false)
    router.push(`/battle/${battleId}`)
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-1 rounded-lg hover:bg-white/5 transition-colors">
            <ChevronLeft size={24} style={{ color: 'var(--accent)' }} />
          </button>
          <Swords size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="text-xl font-bold text-white/90">{t('battle.title')}</h1>
        </div>

        {/* Create Battle CTA */}
        <button
          onClick={() => setShowCreate(true)}
          className="w-full mb-3 p-4 rounded-2xl flex items-center gap-4 transition-all active:scale-[0.98]"
          style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.12)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
            <Plus size={24} className="text-black" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-white/90">{t('battle.create')}</div>
            <div className="text-sm text-white/50">{t('battle.create_sub')}</div>
          </div>
        </button>

        {/* Join with Code CTA */}
        <button
          onClick={() => setShowJoin(true)}
          className="w-full mb-8 p-4 rounded-2xl flex items-center gap-4 border border-white/10 hover:border-white/20 transition-all active:scale-[0.98]"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/10">
            <Hash size={24} className="text-white/70" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-white/90">{t('battle.join')}</div>
            <div className="text-sm text-white/50">{t('battle.join_sub')}</div>
          </div>
        </button>

        {/* Battle History */}
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">{t('battle.history')}</h2>
        {historyLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl skeleton" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-8">{t('battle.no_history')}</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <div
                key={h.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-white/6"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                  backgroundColor: h.placement === 1 ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.06)',
                }}>
                  {h.placement <= 3 ? (
                    <Trophy size={18} style={{ color: h.placement === 1 ? 'var(--accent)' : h.placement === 2 ? '#C0C0C0' : '#CD7F32' }} />
                  ) : (
                    <span className="text-sm font-bold text-white/50">#{h.placement}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/85 truncate">{h.exercise}</div>
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    {h.gameMode === 'TIME_ATTACK' ? <Clock size={12} /> : <Target size={12} />}
                    <span>{h.reps} {t('battle.reps')}</span>
                    <span>·</span>
                    <span>{h.playerCount} jucători</span>
                    {h.verified && <span className="text-green-400">✓</span>}
                  </div>
                </div>
                {h.coinsEarned > 0 && (
                  <span className="text-xs font-semibold text-amber-400">+{h.coinsEarned} 🪙</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBattleSheet
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {showJoin && (
        <JoinBattleSheet
          onClose={() => setShowJoin(false)}
          onJoined={handleJoined}
        />
      )}
    </div>
  )
}
