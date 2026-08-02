'use client'

import { useEffect, useCallback } from 'react'
import { Clock, Target } from 'lucide-react'
import { useBattleTimer } from '@/lib/battle/useBattleTimer'
import { useBattleAudio } from '@/lib/battle/useBattleAudio'
import type { BattleDoc, BattlePlayerDoc } from '@/lib/battle/types'
import type { ExerciseType } from '@/lib/ml/form-coach'
import TugOfWarBar from './TugOfWarBar'
import MultiPlayerBars from './MultiPlayerBars'
import BattleCameraView from './BattleCameraView'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  battle: BattleDoc
  players: BattlePlayerDoc[]
  sortedPlayers: BattlePlayerDoc[]
  myPlayer: BattlePlayerDoc | null
  isHost: boolean
  localReps: number
  onRepIncrement: (newCount: number) => void
  onFinish: (winnerId?: string) => void
  currentUid: string
  cameraReady: boolean
  onCameraReady: () => void
}

export default function BattleActiveView({
  battle, players, sortedPlayers, myPlayer, isHost,
  localReps, onRepIncrement, onFinish, currentUid,
  cameraReady, onCameraReady,
}: Props) {
  const { timeRemaining, isExpired } = useBattleTimer(
    battle.status, battle.startAt, battle.timeLimitSeconds, cameraReady,
  )
  const { playFinish, vibrate } = useBattleAudio()

  const is2Player = players.length === 2

  // ── Time Attack: host finishes when timer expires ─────────────────────────
  useEffect(() => {
    if (!isExpired || !isHost || battle.gameMode !== 'TIME_ATTACK') return
    playFinish()
    vibrate([100, 50, 100])
    onFinish()
  }, [isExpired, isHost, battle.gameMode, onFinish, playFinish, vibrate])

  // ── Race to Target: check if anyone reached target ────────────────────────
  useEffect(() => {
    if (battle.gameMode !== 'RACE_TO_TARGET' || !battle.targetReps) return
    const winner = sortedPlayers.find(p => p.reps >= battle.targetReps!)
    if (winner && isHost) {
      playFinish()
      vibrate([100, 50, 100])
      onFinish(winner.uid)
    }
  }, [sortedPlayers, battle.gameMode, battle.targetReps, isHost, onFinish, playFinish, vibrate])

  // ── Handle camera rep ─────────────────────────────────────────────────────
  const handleCameraRep = useCallback((newCount: number) => {
    onRepIncrement(newCount)
  }, [onRepIncrement])

  // ── Get the two players for 2-player mode ─────────────────────────────────
  const me = players.find(p => p.uid === currentUid)
  const opponent = players.find(p => p.uid !== currentUid)

  return (
    <BattleCameraView
      exerciseType={battle.exerciseType as ExerciseType}
      onRepCounted={handleCameraRep}
      onCameraReady={onCameraReady}
    >
      {/* Progress visualization — overlaid on camera */}
      <div className="absolute top-0 left-0 right-0 z-10">
        {is2Player && me && opponent ? (
          <TugOfWarBar player1={me} player2={opponent} currentUid={currentUid} />
        ) : (
          <div className="pt-2" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}>
            <MultiPlayerBars
              sortedPlayers={sortedPlayers}
              currentUid={currentUid}
              targetReps={battle.targetReps}
            />
          </div>
        )}

        {/* Timer */}
        <div className="flex items-center justify-center gap-2 py-2">
          {battle.gameMode === 'TIME_ATTACK' ? (
            <>
              <Clock size={18} className={timeRemaining <= 10 ? 'text-red-400' : 'text-white/60'} />
              <span
                className={`text-2xl font-black font-mono ${timeRemaining <= 10 ? 'text-red-400' : 'text-white/90'}`}
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
              >
                {cameraReady ? formatTime(timeRemaining) : '--:--'}
              </span>
            </>
          ) : (
            <>
              <Target size={18} style={{ color: 'var(--accent)' }} />
              <span
                className="text-2xl font-black font-mono text-white/90"
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}
              >
                {localReps} / {battle.targetReps}
              </span>
            </>
          )}
        </div>
      </div>
    </BattleCameraView>
  )
}
