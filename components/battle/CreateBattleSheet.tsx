'use client'

import { useState } from 'react'
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useT } from '@/lib/context/LanguageContext'
import { X, Clock, Target, Minus, Plus, Globe, Lock } from 'lucide-react'
import { generateUniqueRoomCode } from '@/lib/battle/room-codes'
import { getExerciseType } from '@/app/(app)/workout/_helpers'
import { TIME_LIMIT_OPTIONS, TARGET_REP_OPTIONS, MIN_PLAYERS, MAX_PLAYERS_LIMIT } from '@/lib/battle/types'
import type { BattleGameMode } from '@/lib/battle/types'
import type { BotDifficulty } from '@/lib/bots/bot-behavior'
import { addBotsToBattle } from '@/lib/bots/useBattleBots'
import { PushUpIcon, PullUpIcon, SquatIcon } from '@/components/icons'

interface Props {
  onClose: () => void
  onCreated: (battleId: string) => void
}

export default function CreateBattleSheet({ onClose, onCreated }: Props) {
  const { user } = useAuth()
  const { displayName, photoUrl, profileLoaded } = useMyProfile()
  const t = useT()

  const CAMERA_EXERCISES = [
    { name: 'Flotări', Icon: PushUpIcon },
    { name: 'Tracțiuni', Icon: PullUpIcon },
    { name: 'Squaturi', Icon: SquatIcon },
  ] as const

  const [exercise, setExercise] = useState('')
  const [gameMode, setGameMode] = useState<BattleGameMode>('TIME_ATTACK')
  const [timeLimit, setTimeLimit] = useState(60)
  const [targetReps, setTargetReps] = useState(20)
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [isPublic, setIsPublic] = useState(true)
  const [addBots, setAddBots] = useState(false)
  const [botCount, setBotCount] = useState(1)
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('MEDIUM')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!user || !exercise || creating || !profileLoaded) return
    setCreating(true)
    try {
      const code = await generateUniqueRoomCode()
      const now = Timestamp.now()
      const expiresAt = new Timestamp(now.seconds + 1800, now.nanoseconds)

      const ref = await addDoc(collection(db, 'battles'), {
        code,
        hostUid: user.uid,
        hostName: displayName,
        hostPhotoUrl: photoUrl,
        exercise,
        exerciseType: getExerciseType(exercise),
        gameMode,
        timeLimitSeconds: gameMode === 'TIME_ATTACK' ? timeLimit : 180,
        targetReps: gameMode === 'RACE_TO_TARGET' ? targetReps : null,
        maxPlayers,
        repCountMethod: 'CAMERA',
        isPublic,
        status: 'LOBBY',
        playerCount: 0,
        startAt: null,
        finishedAt: null,
        winnerId: null,
        createdAt: serverTimestamp(),
        expiresAt,
        ...(addBots && { botCount, botDifficulty }),
      })

      // Add bots to lobby after battle is created
      if (addBots && botCount > 0) {
        addBotsToBattle(ref.id, botCount, botDifficulty).catch(() => {})
      }

      onCreated(ref.id)
    } catch {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl p-5 animate-[slideUp_0.3s_ease-out]"
        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white/90">{t('battle.create')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={20} className="text-white/50" />
          </button>
        </div>

        {/* Exercise picker — 3 camera exercises */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('battle.exercise')}</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {CAMERA_EXERCISES.map(({ name, Icon }) => (
            <button
              key={name}
              onClick={() => setExercise(name)}
              className={`p-4 rounded-2xl flex flex-col items-center gap-2.5 transition-all border ${
                exercise === name
                  ? 'border-[var(--accent)] shadow-[0_0_12px_rgba(var(--accent-rgb),0.15)]'
                  : 'border-white/8 hover:border-white/15'
              }`}
              style={{
                backgroundColor: exercise === name ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <Icon width={40} height={40} />
              <span className={`text-xs font-bold ${exercise === name ? 'text-white' : 'text-white/60'}`}>{name}</span>
            </button>
          ))}
        </div>

        {/* Game Mode */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('battle.game_mode')}</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['TIME_ATTACK', 'RACE_TO_TARGET'] as BattleGameMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setGameMode(mode)}
              className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all border ${
                gameMode === mode
                  ? 'border-[var(--accent)] text-white/90'
                  : 'border-white/8 text-white/50 hover:border-white/15'
              }`}
              style={gameMode === mode ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : { backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              {mode === 'TIME_ATTACK' ? <Clock size={16} /> : <Target size={16} />}
              {mode === 'TIME_ATTACK' ? t('battle.time_attack') : t('battle.race_target')}
            </button>
          ))}
        </div>

        {/* Time limit (TIME_ATTACK) or Target reps (RACE_TO_TARGET) */}
        {gameMode === 'TIME_ATTACK' ? (
          <>
            <label className="block text-sm font-medium text-white/60 mb-2">{t('battle.time_limit')}</label>
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {TIME_LIMIT_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setTimeLimit(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    timeLimit === s
                      ? 'border-[var(--accent)] text-white/90'
                      : 'border-white/8 text-white/50 hover:border-white/15'
                  }`}
                  style={timeLimit === s ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : {}}
                >
                  {s}s
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-white/60 mb-2">{t('battle.target_reps')}</label>
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {TARGET_REP_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setTargetReps(r)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    targetReps === r
                      ? 'border-[var(--accent)] text-white/90'
                      : 'border-white/8 text-white/50 hover:border-white/15'
                  }`}
                  style={targetReps === r ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : {}}
                >
                  {r}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Public / Private toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setIsPublic(true)}
            className={`p-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all border ${
              isPublic ? 'border-[var(--accent)] text-white/90' : 'border-white/8 text-white/50 hover:border-white/15'
            }`}
            style={isPublic ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : { backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <Globe size={16} />
            <div className="text-left">
              <div className="text-xs font-bold">{t('battle.public')}</div>
              <div className="text-[10px] opacity-60">{t('battle.public_desc')}</div>
            </div>
          </button>
          <button
            onClick={() => setIsPublic(false)}
            className={`p-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all border ${
              !isPublic ? 'border-[var(--accent)] text-white/90' : 'border-white/8 text-white/50 hover:border-white/15'
            }`}
            style={!isPublic ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : { backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <Lock size={16} />
            <div className="text-left">
              <div className="text-xs font-bold">{t('battle.private')}</div>
              <div className="text-[10px] opacity-60">{t('battle.private_desc')}</div>
            </div>
          </button>
        </div>

        {/* Max Players */}
        <label className="block text-sm font-medium text-white/60 mb-2">{t('battle.max_players')}</label>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setMaxPlayers(p => Math.max(MIN_PLAYERS, p - 1))}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
            disabled={maxPlayers <= MIN_PLAYERS}
          >
            <Minus size={16} />
          </button>
          <span className="text-lg font-bold text-white/90 w-8 text-center">{maxPlayers}</span>
          <button
            onClick={() => setMaxPlayers(p => Math.min(MAX_PLAYERS_LIMIT, p + 1))}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
            disabled={maxPlayers >= MAX_PLAYERS_LIMIT}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Add Bots */}
        <div className="mb-4">
          <button
            onClick={() => setAddBots(v => !v)}
            className={`w-full p-3 rounded-xl text-sm font-medium flex items-center justify-between transition-all border ${
              addBots ? 'border-[var(--accent)] text-white/90' : 'border-white/8 text-white/50 hover:border-white/15'
            }`}
            style={addBots ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : { backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <span className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              {t('bot.add')}
            </span>
            <div className={`w-9 h-5 rounded-full transition-colors flex items-center ${addBots ? 'bg-[var(--accent)] justify-end' : 'bg-white/15 justify-start'}`}>
              <div className="w-4 h-4 rounded-full bg-white mx-0.5" />
            </div>
          </button>

          {addBots && (
            <div className="mt-3 pl-1">
              {/* Bot count */}
              <label className="block text-sm font-medium text-white/60 mb-2">{t('bot.count')}</label>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setBotCount(c => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
                  disabled={botCount <= 1}
                >
                  <Minus size={16} />
                </button>
                <span className="text-lg font-bold text-white/90 w-8 text-center">{botCount}</span>
                <button
                  onClick={() => setBotCount(c => Math.min(maxPlayers - 1, c + 1))}
                  className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/5 disabled:opacity-30"
                  disabled={botCount >= maxPlayers - 1}
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Bot difficulty */}
              <label className="block text-sm font-medium text-white/60 mb-2">{t('bot.difficulty')}</label>
              <div className="flex gap-1.5">
                {(['EASY', 'MEDIUM', 'HARD'] as BotDifficulty[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setBotDifficulty(d)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      botDifficulty === d
                        ? 'border-[var(--accent)] text-white/90'
                        : 'border-white/8 text-white/50 hover:border-white/15'
                    }`}
                    style={botDifficulty === d ? { backgroundColor: 'rgba(var(--accent-rgb), 0.1)' } : {}}
                  >
                    {t(`bot.${d.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!exercise || creating || !profileLoaded}
          className="w-full h-11 rounded-xl font-semibold text-black transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {creating ? (
            <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : t('battle.create_btn')}
        </button>
      </div>
    </div>
  )
}
