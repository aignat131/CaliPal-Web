import type { Timestamp } from 'firebase/firestore'

// ── Battle Room ──────────────────────────────────────────────────────────────

export type BattleGameMode = 'TIME_ATTACK' | 'RACE_TO_TARGET'
export type BattleStatus = 'LOBBY' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED' | 'CANCELLED'
export type BattleRepMethod = 'CAMERA'
export type BattleExerciseType = 'pullup' | 'pushup' | 'squat'

export interface BattleDoc {
  id: string
  code: string                        // 6-char uppercase alphanumeric
  hostUid: string
  hostName: string
  hostPhotoUrl: string

  // Settings (immutable after creation)
  exercise: string                    // exercise name from catalogue
  exerciseType: BattleExerciseType         // always set (camera-only)
  gameMode: BattleGameMode
  timeLimitSeconds: number            // 30 | 60 | 90 | 120 | 180
  targetReps: number | null           // only for RACE_TO_TARGET
  maxPlayers: number                  // 2–8
  repCountMethod: BattleRepMethod
  isPublic: boolean                   // true = visible in public lobby

  // State
  status: BattleStatus
  playerCount: number
  startAt: Timestamp | null           // set when host starts countdown
  finishedAt: Timestamp | null
  winnerId: string | null             // uid of winner (RACE_TO_TARGET early finish)

  createdAt: Timestamp
  expiresAt: Timestamp                // createdAt + 30 min
}

// ── Battle Player ────────────────────────────────────────────────────────────

export type PlayerRepMethod = 'CAMERA'

export interface BattlePlayerDoc {
  uid: string
  displayName: string
  photoUrl: string

  // Lobby
  isReady: boolean
  repMethod: PlayerRepMethod
  joinedAt: Timestamp

  // Active game
  reps: number
  lastRepAt: Timestamp | null
  isConnected: boolean

  // Results
  placement: number | null
  coinsEarned: number
  finished: boolean
}

// ── Battle History (denormalized under user) ─────────────────────────────────

export interface UserBattleHistory {
  battleId: string
  code: string
  exercise: string
  gameMode: BattleGameMode
  reps: number
  placement: number
  playerCount: number
  coinsEarned: number
  playedAt: Timestamp
}

// ── Constants ────────────────────────────────────────────────────────────────

export const TIME_LIMIT_OPTIONS = [30, 60, 90, 120, 180] as const
export const TARGET_REP_OPTIONS = [10, 20, 30, 50] as const
export const MIN_PLAYERS = 2
export const MAX_PLAYERS_LIMIT = 8
export const COUNTDOWN_DURATION_MS = 4000

/** 8 distinct player colors for multi-player bars */
export const PLAYER_COLORS = [
  '#1ED75F', // green (brand)
  '#3B82F6', // blue
  '#F97316', // orange
  '#A855F7', // purple
  '#EF4444', // red
  '#06B6D4', // cyan
  '#F59E0B', // amber
  '#EC4899', // pink
] as const
