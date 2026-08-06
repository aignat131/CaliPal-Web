import type { Timestamp } from 'firebase/firestore'
import type { ProgramWeek } from '@/lib/data/training-programs'

export type LocationSharingMode = 'OFF' | 'FRIENDS_ONLY' | 'EVERYWHERE' | 'TRAINING_ONLY'

export interface UserDoc {
  uid: string
  displayName: string
  email: string
  bio: string
  isCoach: boolean
  photoUrl: string
  totalWorkouts: number
  currentStreak: number
  lastWorkoutDate?: string
  coins: number
  friendCount: number
  assessmentCompleted: boolean
  joinedCommunityIds: string[]
  favoriteCommunityId?: string
  favoriteExercises?: string[]
  locationSharingMode?: LocationSharingMode
  basicStrength?: BasicStrength
  skillsByCategory?: SkillsByCategory
  favoriteSkillIds?: string[]
  createdAt: Timestamp | null
  messageEmailNotifications?: boolean
  trainingEmailNotifications?: boolean
  newsEmailNotifications?: boolean
  pushNotifMessages?: boolean
  pushNotifTrainings?: boolean
  pushNotifCommunity?: boolean
  pushNotifFriends?: boolean
  proTitle?: boolean
  totalTrainings?: number
  customNickname?: string
  profileFrame?: string        // 'GOLD' | 'FIRE' | 'GLOW'
  nameColor?: string           // hex color
  titleBadge?: string          // 'BEAST_MODE' | 'IRON_WILL' | 'CHAMPION'
  emojiBadge?: string          // emoji string
  pinnedExercises?: string[]   // exercise names pinned to top of stats
  activeProgramId?: string     // currently enrolled program
  completedPrograms?: number   // count of completed programs
}

export interface CommunityDoc {
  id: string
  name: string
  description: string
  location: string
  latitude: number
  longitude: number
  creatorId: string
  creatorName: string
  memberCount: number
  isPublic: boolean
  imageUrl: string
  verified?: boolean
  verifiedAt?: Timestamp | null
  createdAt: Timestamp | null
}

export interface CommunityMember {
  userId: string
  displayName: string
  role: MemberRole
  level: number
  points: number
  photoUrl: string | null
  joinedAt: Timestamp | null
  emailNotifications?: boolean
  trainingPoints?: number           // points earned from training attendance (10 pts per training)
  trainingAttendanceStreak?: number // consecutive calendar days attended
  lastAttendanceDate?: string       // "yyyy-MM-dd" — streak computation
  totalTrainingsAttended?: number   // for "Committed" badge (>= 5)
}

export type MemberRole = 'ADMIN' | 'MODERATOR' | 'TRAINER' | 'MEMBER'

export const ROLE_LABELS: Record<MemberRole, string> = {
  ADMIN: 'Fondator',
  MODERATOR: 'Voluntar',
  TRAINER: 'Antrenor',
  MEMBER: 'Membru',
}

export interface CommunityPost {
  id: string
  authorId: string
  authorName: string
  authorRole: MemberRole
  authorPhotoUrl?: string | null
  content: string
  likesCount: number
  commentsCount: number
  photoUrl?: string
  feeling?: number   // 1–5
  createdAt: Timestamp | null
  // Optional workout-specific structured fields (set when sharing from workout)
  workoutNote?: string
  workoutDuration?: number            // seconds
  workoutReps?: number
  workoutExercises?: { name: string; summary: string }[]
  mentionedUserIds?: string[]
  // Client-side only — populated when displaying posts in the home feed
  communityId?: string
  communityName?: string
}

export interface TrainingExercise {
  name: string
  sets: number
  repsPerSet: number
}

export interface PlannedTraining {
  id: string
  name: string
  description: string
  timeStart: string     // full datetime "dd/MM/yyyy HH:mm"
  timeEnd: string       // full datetime "dd/MM/yyyy HH:mm"
  location: string
  authorId: string
  authorName: string
  authorCoach: boolean
  authorAdmin: boolean
  official: boolean
  reminderMinutes: number
  exercises: TrainingExercise[]
  rsvps: Record<string, 'GOING' | 'NOT_GOING' | 'MAYBE'>
  rsvpNames?: Record<string, string>
  rsvpPhotos?: Record<string, string>
  guestRsvps?: Record<string, { name: string; status: 'GOING' }>
  equipment?: string[]
  createdAt: Timestamp | null
  lastRsvpNotifAt?: Timestamp | null
  // Legacy field — web-created trainings before the format change stored a separate date string
  date?: string
  // Attendance close
  isClosed?: boolean
  attendedBy?: string[]        // confirmed attendee userIds
  closedAt?: Timestamp | null
  closedByUid?: string
  // Soft-delete
  deletedAt?: Timestamp | null
  deletedByUid?: string
  // Training photos
  photoCount?: number
  commentsCount?: number
  // Visibility
  visibility?: 'public' | 'private'
}

export interface TrainingPhoto {
  id: string
  authorId: string
  authorName: string
  authorPhotoUrl?: string | null
  photoUrl: string
  visibility?: 'public' | 'private'
  createdAt: Timestamp | null
}

export interface ConversationDoc {
  id: string
  participantIds: string[]
  participantNames: Record<string, string>
  participantPhotos: Record<string, string>
  lastMessage: string
  lastMessageSenderId: string
  lastMessageTimestamp: Timestamp | null
  unreadCount: Record<string, number>
  firstMessageEmailSent?: boolean
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: Timestamp | null
  isRead: boolean
  reactions?: Record<string, string[]>  // emoji → array of userIds
  replyToId?: string
  replyToText?: string
  replyToSenderName?: string
  imageUrl?: string
}

export interface FriendRequest {
  id: string
  fromUid: string
  fromName: string
  fromPhotoUrl: string
  toUid: string
  toName: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  sentAt: Timestamp | null
}

export interface FriendEntry {
  friendUid: string
  friendName: string
  friendPhotoUrl: string
  since: Timestamp | null
}

export function conversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_')
}

// ── Workout ───────────────────────────────────────────────────────────────────

export interface WorkoutSet {
  reps?: number
  durationSeconds?: number
  weightKg?: number  // added weight for this set
  bandKg?: number    // band resistance for this set
  timedDurationSeconds?: number  // AMRAP countdown (e.g. 180 = "3 min push-ups")
  recorded?: boolean  // true when set was captured via camera rep counter
}

export type GripType = 'pronat' | 'supinat' | 'neutru'

export interface WorkoutExercise {
  name: string
  category: string
  sets: WorkoutSet[]
  fromProgram?: boolean   // true only when pre-loaded from a community/program training card
  grip?: GripType         // pull exercise grip: pronat (default), supinat, neutru
}

export interface ProgramRef {
  programId: string
  week: number
  day: number
  programSource: 'hardcoded' | 'firestore'
}

export interface WorkoutDoc {
  id: string
  userId: string
  exercises: WorkoutExercise[]
  circuits?: WorkoutCircuit[]
  durationSeconds: number
  totalReps: number
  coinsEarned: number
  note: string
  programRef?: ProgramRef
  createdAt: Timestamp | null
}

// ── Circuit ──────────────────────────────────────────────────────────────────

export interface CircuitRound {
  roundNumber: number
  durationSeconds: number
}

export interface WorkoutCircuit {
  id: string
  exerciseIndices: number[]
  targetRounds: number
  rounds: CircuitRound[]
}

// ── Rep Session (crash recovery) ─────────────────────────────────────────────

export interface RepSession {
  exerciseType: 'pullup' | 'pushup' | 'squat'
  exerciseName: string
  repCount: number
  firstRepTimestamp: number | null
  lastRepTimestamp: number | null
  savedAt: number
}

// ── Unified Rep Session (crash recovery for auto-detect counter) ────────────

export interface UnifiedRepSession {
  exercises: { type: 'pullup' | 'pushup' | 'squat'; name: string; reps: number }[]
  firstRepTimestamp: number | null
  lastRepTimestamp: number | null
  savedAt: number
}

// ── Hold Session (crash recovery for static hold timer) ─────────────────────

export interface HoldSession {
  holdExercise: string
  exerciseName: string
  totalHoldMs: number
  bestSegmentMs: number
  holdCount: number
  savedAt: number
}

// ── Challenge ─────────────────────────────────────────────────────────────────

export interface WeeklyChallenge {
  id: string
  title: string
  description: string
  exerciseName: string
  targetReps: number
  coinsReward: number
  endsAt: Timestamp | null
}

export interface UserChallengeProgress {
  challengeId: string
  currentReps: number
  completed: boolean
  completedAt: Timestamp | null
}

// ── Community Challenges ──────────────────────────────────────────────────────

export interface CommunityChallenge {
  id: string
  title: string
  exerciseName: string
  targetReps: number
  coinsReward: number
  communityId: string
  createdAt: Timestamp | null
  endsAt: Timestamp | null
}

export interface UserCommunityChallengeProgress {
  challengeId: string
  communityId: string
  currentReps: number
  completed: boolean
  completedAt: Timestamp | null
}

// ── Skills ────────────────────────────────────────────────────────────────────

// Assessment / basic strength (matches Android BasicStrengthResult)
export type CalisthenicsLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite'
export type PushupType        = 'none' | 'knee' | 'regular'
export type PullupType        = 'none' | 'australian' | 'regular'
export type CardioFrequency   = 'never' | 'rarely' | 'regular' | 'daily'

export interface BasicStrength {
  level:   CalisthenicsLevel
  pushups: { type: PushupType;  count: number }
  pullups: { type: PullupType;  count: number }
  squats:  { count: number }
  cardio:  CardioFrequency
}

// Skill items stored in Firestore (matches Android SkillItem)
export interface SkillItem     { id: string; name: string }
export interface UserSkillData { have: SkillItem[]; wantToLearn: SkillItem[]; close?: SkillItem[] }
export type SkillsByCategory   = Record<string, UserSkillData>  // key = categoryId

// Skill category definitions loaded from Firestore skillCategories collection
export interface SkillCategoryDef {
  id:       string
  name:     string
  order:    number
  question: string
  skills:   SkillItem[]
}

// Legacy types — kept so old imports (lib/skills.ts) don't break
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE'
export type SkillCategory = 'STRENGTH' | 'MOBILITY' | 'CARDIO'

export interface SkillDef {
  id: string
  name: string
  description: string
  level: SkillLevel
  category: SkillCategory
  icon: string
  coinsReward: number
  requirements: string[]
  maxRepsToUnlock?: number
}

export interface UnlockedSkill {
  skillId: string
  unlockedAt: Timestamp | null
}

export interface ParkDoc {
  id: string
  name: string
  address: string
  city: string
  description: string
  latitude: number
  longitude: number
  communityId: string | null
  placeId: string
  addedByUid: string
  upcomingTrainingCount?: number
  createdAt: Timestamp | null
}

export interface LiveLocation {
  uid: string
  displayName: string
  photoUrl: string
  latitude: number
  longitude: number
  updatedAt: Timestamp | null
}

export interface ParkPresenceMember {
  uid: string
  displayName: string
  photoUrl: string
  joinedAt: Timestamp | null
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'NEW_MESSAGE'
  | 'FRIEND_REQUEST'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'TRAINING_STARTED'
  | 'TRAINING_UPDATED'
  | 'TRAINING_DELETED'
  | 'COMMUNITY_DELETED'
  | 'COMMUNITY_REQUEST_APPROVED'
  | 'COMMUNITY_REQUEST_REJECTED'
  | 'FRIEND_AT_YOUR_PARK'
  | 'PARK_REQUEST'
  | 'PARK_CREATED'
  | 'OFFICIAL_TRAINING_POSTED'
  | 'COMMUNITY_REMOVED'
  | 'TRAINING_RSVP'
  | 'PHOTO_DELETED'
  | 'TASK_COMPLETED'
  | 'POST_MENTION'
  | 'BATTLE_INVITE'
  | 'BATTLE_RESULT'
  | 'EVENT_INVITE'
  | 'EVENT_RESULT'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  isRead: boolean
  createdAt: Timestamp | null
  relatedId?: string   // conversationId, communityId, parkId, etc.
}

// ── Park Requests ─────────────────────────────────────────────────────────────

export interface ParkCommunityRequest {
  id: string
  parkId: string
  parkName: string
  communityId: string
  communityName: string
  requestedByUid: string
  requestedByName: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEW'
  createdAt: Timestamp | null
}

export interface VerificationRequest {
  id: string
  communityId: string
  communityName: string
  requestedByUid: string
  requestedByName: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: Timestamp | null
}

// ── Community Posts ───────────────────────────────────────────────────────────

export interface PostLike {
  uid: string
  likedAt: Timestamp | null
}

export interface PostComment {
  id: string
  authorId: string
  authorName: string
  authorPhotoUrl?: string | null
  text: string
  createdAt: Timestamp | null
}

// ── Coach / Form Check ────────────────────────────────────────────────────────

export interface FormCheckRequest {
  id: string
  userId: string
  userName: string
  exerciseName: string
  notes: string
  status: 'PENDING' | 'REVIEWED'
  feedback?: string
  coinsSpent: number
  createdAt: Timestamp | null
}

export interface ParkRequest {
  id: string
  name: string
  address: string
  city: string
  description: string
  latitude: number
  longitude: number
  requestedByUid: string
  requestedByName: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: Timestamp | null
}

export interface LeaderboardEntry {
  uid: string
  displayName: string
  photoUrl: string
  totalPushupReps: number
  updatedAt: Timestamp | null
}

// ── Program Enrollment & Progress ────────────────────────────────────────────

export interface DayCompletion {
  completedAt: string   // ISO date
  workoutId: string     // linked workout doc ID
}

export interface ProgramEnrollment {
  programId: string
  programSource: 'hardcoded' | 'firestore'
  programName: string
  status: 'active' | 'completed' | 'abandoned'
  enrolledAt: Timestamp | null
  completedAt: Timestamp | null
  currentWeek: number
  currentDay: number
  totalWeeks: number
  totalDays: number
  completedDays: number
  dayProgress: Record<string, DayCompletion>
  exerciseSwaps: Record<string, string>
}

// ── Firestore-backed Training Programs ───────────────────────────────────────

export interface FirestoreTrainingProgram {
  id: string
  name: string
  description: string
  level: 'beginner' | 'intermediate' | 'advanced'
  durationWeeks: number
  focusEmoji: string
  focusLabel: string
  published: boolean
  order: number
  weeks: ProgramWeek[]
  creatorUid?: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}
