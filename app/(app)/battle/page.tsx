'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useT } from '@/lib/context/LanguageContext'
import { Swords, Plus, Hash, ChevronLeft, ChevronRight, Clock, Target, Users, History } from 'lucide-react'
import { getRecoveredBattleId } from '@/lib/battle/useBattle'
import type { BattleDoc } from '@/lib/battle/types'
import type { UserBattleHistory } from '@/lib/battle/types'
import CreateBattleSheet from '@/components/battle/CreateBattleSheet'
import JoinBattleSheet from '@/components/battle/JoinBattleSheet'

export default function BattlePage() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useT()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [liveBattles, setLiveBattles] = useState<(BattleDoc & { id: string })[]>([])
  const [liveLoading, setLiveLoading] = useState(true)
  const [history, setHistory] = useState<(UserBattleHistory & { id: string })[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Check for crash recovery
  useEffect(() => {
    const recovered = getRecoveredBattleId()
    if (recovered) router.replace(`/battle/${recovered}`)
  }, [router])

  // Load live public battles
  useEffect(() => {
    const q = query(
      collection(db, 'battles'),
      where('isPublic', '==', true),
      where('status', '==', 'LOBBY'),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(q, (snap) => {
      setLiveBattles(snap.docs.map(d => ({ id: d.id, ...d.data() } as BattleDoc & { id: string })))
      setLiveLoading(false)
    })
    return unsub
  }, [])

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
          <button onClick={() => router.push('/workout')} className="p-1 rounded-lg hover:bg-white/5 transition-colors">
            <ChevronLeft size={24} style={{ color: 'var(--accent)' }} />
          </button>
          <Swords size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="text-xl font-bold text-white/90 flex-1">{t('battle.title')}</h1>
          {/* History button */}
          <button
            onClick={() => setShowHistory(h => !h)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <History size={20} className="text-white/50" />
          </button>
        </div>

        {/* Create & Join CTAs — side by side */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => setShowCreate(true)}
            className="p-3.5 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.97]"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.12)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
              <Plus size={20} className="text-black" />
            </div>
            <span className="font-semibold text-white/90 text-sm">{t('battle.create')}</span>
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="p-3.5 rounded-2xl flex flex-col items-center gap-2 border border-white/10 hover:border-white/20 transition-all active:scale-[0.97]"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10">
              <Hash size={20} className="text-white/70" />
            </div>
            <span className="font-semibold text-white/90 text-sm">{t('battle.join')}</span>
          </button>
        </div>

        {/* History panel (toggled) */}
        {showHistory && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">{t('battle.history')}</h2>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl skeleton" />)}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-6">{t('battle.no_history')}</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {history.map(h => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-white/6"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                      backgroundColor: h.placement === 1 ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(255,255,255,0.06)',
                    }}>
                      <span className="text-sm font-bold" style={{ color: h.placement === 1 ? 'var(--accent)' : 'rgba(255,255,255,0.4)' }}>
                        #{h.placement}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/85 truncate">{h.exercise}</div>
                      <div className="flex items-center gap-2 text-xs text-white/45">
                        <span>{h.reps} {t('battle.reps')}</span>
                        <span>·</span>
                        <span>{h.playerCount} {t('battle.players')}</span>
                      </div>
                    </div>
                    {h.coinsEarned > 0 && (
                      <span className="text-xs font-semibold text-amber-400">+{h.coinsEarned}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live Public Battles */}
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          {t('battle.live_battles')}
        </h2>
        {liveLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}
          </div>
        ) : liveBattles.length === 0 ? (
          <div className="text-center py-12">
            <Swords size={36} className="text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">{t('battle.no_live')}</p>
            <p className="text-xs text-white/25 mt-1">{t('battle.create_sub')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {liveBattles.map(b => (
              <button
                key={b.id}
                onClick={() => router.push(`/battle/${b.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/8 hover:border-white/15 transition-all active:scale-[0.98] text-left"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.1)' }}>
                  <Swords size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white/85 truncate">{b.exercise}</div>
                  <div className="flex items-center gap-2 text-xs text-white/45">
                    {b.gameMode === 'TIME_ATTACK' ? <Clock size={11} /> : <Target size={11} />}
                    <span>{b.gameMode === 'TIME_ATTACK' ? `${b.timeLimitSeconds}s` : `${b.targetReps} rep`}</span>
                    <span>·</span>
                    <Users size={11} />
                    <span>{b.playerCount}/{b.maxPlayers}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-white/40">{b.hostName}</span>
                  <ChevronRight size={14} className="text-white/20" />
                </div>
              </button>
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
