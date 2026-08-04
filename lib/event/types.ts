import type { Timestamp } from 'firebase/firestore'

// ── Event Room ──────────────────────────────────────────────────────────────

export type EventStatus = 'LOBBY' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED' | 'CANCELLED'

export interface EventExerciseConfig {
  name: string
  exerciseType: 'pushup' | 'pullup' | 'squat' | null  // null = manual-only
  pointsPerRep: number
}

export interface EventDoc {
  id: string
  code: string                          // 6-char uppercase alphanumeric
  hostUid: string
  hostName: string
  hostPhotoUrl: string

  // Settings (immutable after creation)
  name: string                          // event name
  description: string
  exercises: EventExerciseConfig[]
  scheduledAt: Timestamp | null         // optional scheduled start
  durationMinutes: number | null        // null = open-ended (host ends manually)
  maxParticipants: number               // default 20
  isPublic: boolean                     // publicly visible & joinable without code

  // State
  status: EventStatus
  participantCount: number
  startedAt: Timestamp | null
  finishedAt: Timestamp | null

  createdAt: Timestamp
  expiresAt: Timestamp                  // createdAt + 24h
}

// ── Event Participant ───────────────────────────────────────────────────────

export interface EventParticipantDoc {
  uid: string
  displayName: string
  photoUrl: string
  joinedAt: Timestamp

  // Active tracking
  reps: Record<string, number>          // exerciseName → rep count
  totalPoints: number                   // sum(reps[ex] × pointsPerRep[ex])
  lastRepAt: Timestamp | null
  isConnected: boolean

  // Cosmetics (denormalized from user profile)
  nameColor?: string
  emojiBadge?: string
  titleBadge?: string
  profileFrame?: string

  // Results
  placement: number | null
  coinsEarned: number
}

// ── Event History (denormalized under user) ─────────────────────────────────

export interface UserEventHistory {
  eventId: string
  code: string
  name: string
  exercises: string[]                   // exercise names
  totalPoints: number
  placement: number
  participantCount: number
  coinsEarned: number
  playedAt: Timestamp
}

// ── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_EXERCISES: EventExerciseConfig[] = [
  { name: 'Flotări', exerciseType: 'pushup', pointsPerRep: 1 },
  { name: 'Tracțiuni', exerciseType: 'pullup', pointsPerRep: 2 },
  { name: 'Squaturi', exerciseType: 'squat', pointsPerRep: 1 },
]

export const DEFAULT_MAX_PARTICIPANTS = 20
export const MAX_PARTICIPANTS_LIMIT = 50
export const MIN_PARTICIPANTS = 2
export const COUNTDOWN_DURATION_MS = 5000
export const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60] as const

/** Coin rewards by placement */
export const EVENT_PLACEMENT_COINS = [20, 12, 8] as const  // 1st, 2nd, 3rd
export const EVENT_PARTICIPATION_COINS = 3
