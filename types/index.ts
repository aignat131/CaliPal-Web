import type { Timestamp } from 'firebase/firestore'

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
  coins: number
  friendCount: number
  assessmentCompleted: boolean
  joinedCommunityIds: string[]
  favoriteCommunityId?: string
  locationSharingMode?: LocationSharingMode
  createdAt: Timestamp | null
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
}

export type MemberRole = 'ADMIN' | 'MODERATOR' | 'TRAINER' | 'MEMBER'

export const ROLE_LABELS: Record<MemberRole, string> = {
  ADMIN: '👑 Fondator',
  MODERATOR: '🛡️ Voluntar',
  TRAINER: '🏋️ Antrenor',
  MEMBER: 'Membru',
}

export interface CommunityPost {
  id: string
  authorId: string
  authorName: string
  authorRole: MemberRole
  content: string
  likesCount: number
  commentsCount: number
  createdAt: Timestamp | null
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
  date: string          // ISO date e.g. "2025-05-20"
  timeStart: string
  timeEnd: string
  location: string
  authorId: string
  authorName: string
  official: boolean
  exercises: TrainingExercise[]
  rsvps: Record<string, 'GOING' | 'NOT_GOING' | 'MAYBE'>
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
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  timestamp: Timestamp | null
  isRead: boolean
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
}

export interface WorkoutExercise {
  name: string
  category: string
  sets: WorkoutSet[]
}

export interface WorkoutDoc {
  id: string
  userId: string
  exercises: WorkoutExercise[]
  durationSeconds: number
  totalReps: number
  coinsEarned: number
  note: string
  createdAt: Timestamp | null
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

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE'

export interface SkillDef {
  id: string
  name: string
  description: string
  level: SkillLevel
  icon: string
  coinsReward: number
  requirements: string[] // ids of prerequisite skills
  maxRepsToUnlock?: number // min reps needed (from assessment)
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
  | 'FRIEND_AT_YOUR_PARK'
  | 'PARK_REQUEST'
  | 'PARK_CREATED'
  | 'OFFICIAL_TRAINING_POSTED'

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

// ── Community Posts ───────────────────────────────────────────────────────────

export interface PostLike {
  uid: string
  likedAt: Timestamp | null
}

export interface PostComment {
  id: string
  authorId: string
  authorName: string
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
