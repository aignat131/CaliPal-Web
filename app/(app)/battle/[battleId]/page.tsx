'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useT } from '@/lib/context/LanguageContext'
import { useBattle } from '@/lib/battle/useBattle'
import { COUNTDOWN_DURATION_MS } from '@/lib/battle/types'
import BattleLobby from '@/components/battle/BattleLobby'
import BattleCountdown from '@/components/battle/BattleCountdown'
import BattleActiveView from '@/components/battle/BattleActiveView'
import BattleResultsScreen from '@/components/battle/BattleResultsScreen'

type Screen = 'loading' | 'lobby' | 'countdown' | 'active' | 'results' | 'cancelled' | 'error'

export default function BattleRoomPage() {
  const params = useParams()
  const battleId = params.battleId as string
  const router = useRouter()
  const { user } = useAuth()
  const { displayName, photoUrl, profileLoaded } = useMyProfile()
  const t = useT()

  const {
    battle, players, myPlayer, isHost, loading, error,
    sortedPlayers, winner, readyCount,
    joinBattle, toggleReady,
    startBattle, activateBattle, finishBattle, cancelBattle, leaveBattle,
    incrementReps, markFinished,
  } = useBattle(battleId)

  const [screen, setScreen] = useState<Screen>('loading')
  const [localReps, setLocalReps] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)

  // ── Determine screen from battle status ───────────────────────────────────
  useEffect(() => {
    if (loading) { setScreen('loading'); return }
    if (error || !battle) { setScreen('error'); return }

    switch (battle.status) {
      case 'LOBBY': setScreen('lobby'); break
      case 'COUNTDOWN': setScreen('countdown'); break
      case 'ACTIVE': setScreen('active'); break
      case 'FINISHED': setScreen('results'); break
      case 'CANCELLED': setScreen('cancelled'); break
    }
  }, [battle?.status, loading, error])

  // ── Auto-join if not already a player ─────────────────────────────────────
  useEffect(() => {
    if (!user || !battle || loading || !profileLoaded) return
    if (battle.status !== 'LOBBY') return
    if (myPlayer) return // already joined
    if (players.length >= battle.maxPlayers) return // full

    joinBattle(displayName, photoUrl)
  }, [user, battle, myPlayer, players.length, loading, profileLoaded, displayName, photoUrl, joinBattle])

  // ── Countdown → Active transition (host only) ────────────────────────────
  useEffect(() => {
    if (screen !== 'countdown' || !isHost || !battle?.startAt) return
    const startMs = battle.startAt.toMillis()
    const delay = (startMs + COUNTDOWN_DURATION_MS) - Date.now()
    const timer = setTimeout(() => activateBattle(), Math.max(0, delay))
    return () => clearTimeout(timer)
  }, [screen, isHost, battle?.startAt, activateBattle])

  // ── Handle rep increment ──────────────────────────────────────────────────
  const handleRepIncrement = useCallback((newCount: number) => {
    setLocalReps(newCount)
    incrementReps(newCount)
  }, [incrementReps])

  const handleCameraReady = useCallback(() => {
    setCameraReady(true)
  }, [])

  // ── Handle leave/cancel ───────────────────────────────────────────────────
  const handleLeave = useCallback(async () => {
    await leaveBattle()
    router.push('/battle')
  }, [leaveBattle, router])

  const handleCancel = useCallback(async () => {
    await cancelBattle()
  }, [cancelBattle])

  // Suppress unused
  void winner

  // ── Render ────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <div className="w-6 h-6 border-2 border-white/30 border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    )
  }

  if (screen === 'error' || !battle) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <p className="text-white/60">{error || t('battle.not_found')}</p>
        <button
          onClick={() => router.push('/battle')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-black"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {t('battle.home')}
        </button>
      </div>
    )
  }

  if (screen === 'cancelled') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <p className="text-white/60">{t('battle.cancelled')}</p>
        <button
          onClick={() => router.push('/battle')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-black"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {t('battle.home')}
        </button>
      </div>
    )
  }

  if (screen === 'lobby') {
    if (!user) return null
    return (
      <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <BattleLobby
          battle={battle}
          players={players}
          myPlayer={myPlayer}
          isHost={isHost}
          readyCount={readyCount}
          onToggleReady={toggleReady}
          onStart={startBattle}
          onCancel={handleCancel}
          onLeave={handleLeave}
          currentUid={user.uid}
        />
      </div>
    )
  }

  // Countdown + Active both render the camera (pre-loading during countdown)
  if (screen === 'countdown' || screen === 'active') {
    return (
      <>
        <BattleActiveView
          battle={battle}
          players={players}
          sortedPlayers={sortedPlayers}
          myPlayer={myPlayer}
          isHost={isHost}
          localReps={localReps}
          onRepIncrement={handleRepIncrement}
          onFinish={finishBattle}
          currentUid={user?.uid ?? ''}
          cameraReady={cameraReady}
          onCameraReady={handleCameraReady}
        />
        {/* Countdown overlay on top of camera */}
        {screen === 'countdown' && (
          <BattleCountdown startAt={battle.startAt!} />
        )}
      </>
    )
  }

  if (screen === 'results') {
    return (
      <div className="min-h-screen pb-20 md:pb-0 md:ml-16 lg:ml-48">
        <BattleResultsScreen
          battle={battle}
          sortedPlayers={sortedPlayers}
          myPlayer={myPlayer}
          currentUid={user?.uid ?? ''}
          onRematch={() => router.push('/battle')}
          onHome={() => router.push('/battle')}
          onMarkFinished={markFinished}
        />
      </div>
    )
  }

  return null
}
