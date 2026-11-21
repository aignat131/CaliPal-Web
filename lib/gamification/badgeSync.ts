import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { createNotification } from '@/lib/firebase/notifications'
import type { UserDoc, WorkoutDoc } from '@/types'
import { evaluateBadges, levelFor, type BadgeResult, type BadgeStats } from './badges'
import { LIFTS, computeRecords, formatRecordValue, type RecordMap } from './records'
import { checkChallenges } from './challenges'

const WORKOUT_LIMIT = 1000

export interface BadgeData {
  stats: BadgeStats
  records: RecordMap
  results: BadgeResult[]
  stored: Record<string, number>
  workouts: WorkoutDoc[]
}

async function loadWorkouts(uid: string): Promise<WorkoutDoc[]> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'workouts'), orderBy('createdAt', 'desc'), limit(WORKOUT_LIMIT),
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc)
}

async function loadBattleWins(uid: string): Promise<number> {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'battle_history'), where('placement', '==', 1),
    ))
    return snap.docs.filter(d => (d.data().playerCount ?? 0) > 1).length
  } catch {
    return 0
  }
}

export async function loadStoredBadges(uid: string): Promise<Record<string, number>> {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'badges'))
    const out: Record<string, number> = {}
    snap.docs.forEach(d => { out[d.id] = (d.data().level as number) ?? 0 })
    return out
  } catch {
    return {}
  }
}

function statsFrom(user: Partial<UserDoc>, workouts: WorkoutDoc[], battleWins: number): BadgeStats {
  const skillsMastered = Object.values(user.skillsByCategory ?? {})
    .reduce((sum, cat) => sum + (cat?.have?.length ?? 0), 0)
  return {
    records: computeRecords(workouts),
    // The user counter can lag behind (or ahead of) the stored docs; trust the larger.
    totalWorkouts: Math.max(user.totalWorkouts ?? 0, workouts.length),
    currentStreak: user.currentStreak ?? 0,
    trainingsAttended: user.totalTrainings ?? 0,
    friendCount: user.friendCount ?? 0,
    battleWins,
    skillsMastered,
    completedPrograms: user.completedPrograms ?? 0,
  }
}

/** Everything a profile needs to render badges and records for `uid`. */
export async function loadBadgeData(uid: string, user?: Partial<UserDoc> | null): Promise<BadgeData> {
  const [userDoc, workouts, battleWins, stored] = await Promise.all([
    user ? Promise.resolve(user) : getDoc(doc(db, 'users', uid)).then(s => (s.data() ?? {}) as Partial<UserDoc>),
    loadWorkouts(uid),
    loadBattleWins(uid),
    loadStoredBadges(uid),
  ])
  const stats = statsFrom(userDoc, workouts, battleWins)
  return { stats, records: stats.records, results: evaluateBadges(stats, stored), stored, workouts }
}

/**
 * Persist newly reached badge levels for the signed-in user and notify them.
 * Returns the badges that levelled up. Safe to call often; it only writes changes.
 */
export async function syncBadges(uid: string, data: BadgeData): Promise<BadgeResult[]> {
  const upgraded = data.results.filter(r => levelFor(r.def, r.value) > (data.stored[r.def.id] ?? 0))
  if (upgraded.length === 0) return []
  await Promise.all(upgraded.map(r => setDoc(doc(db, 'users', uid, 'badges', r.def.id), {
    badgeId: r.def.id,
    level: levelFor(r.def, r.value),
    updatedAt: serverTimestamp(),
  }, { merge: true })))
  for (const r of upgraded) data.stored[r.def.id] = levelFor(r.def, r.value)

  // First sync for an existing user would announce many badges at once; collapse it.
  if (upgraded.length > 3) {
    await createNotification(uid, 'BADGE_EARNED', '🏅 Insigne noi!',
      `Ai deblocat ${upgraded.length} insigne. Vezi-le pe profil.`, undefined, uid)
  } else {
    for (const r of upgraded) {
      const tiered = r.def.thresholds.length > 1
      const tier = tiered ? ` (${['bronz', 'argint', 'aur'][levelFor(r.def, r.value) - 1]})` : ''
      await createNotification(uid, 'BADGE_EARNED', `${r.def.icon} Insignă nouă: ${r.def.name.RO}${tier}`,
        'Vezi toate insignele pe profilul tău.', r.def.id, uid)
    }
  }
  return upgraded
}

// ── Public records (leaderboard) ─────────────────────────────────────────────
// user_records/{uid}: one flat doc per user so leaderboards can orderBy a lift.
// Field `<lift>` = best competitive value, `<lift>_v` = counted by the camera.

export const RECORD_CAPS = { reps: 500, seconds: 3600 } as const

export function recordFields(records: RecordMap): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  for (const l of LIFTS) {
    const r = records[l.key]
    out[l.key] = Math.round(Math.min(r.value, RECORD_CAPS[l.metric]))
    out[`${l.key}_v`] = r.verified
  }
  return out
}

/** Write the user's competitive records if they changed. Never throws. */
export async function publishRecords(uid: string, user: Partial<UserDoc>, workouts: WorkoutDoc[]): Promise<void> {
  try {
    const fields = recordFields(computeRecords(workouts, { competitive: true }))
    const ref = doc(db, 'user_records', uid)
    const snap = await getDoc(ref)
    const prev = snap.data() ?? {}
    const changed = !snap.exists()
      || Object.entries(fields).some(([k, v]) => prev[k] !== v)
      || prev.displayName !== (user.displayName ?? '')
      || prev.photoUrl !== (user.photoUrl ?? '')
    if (!changed) return
    await setDoc(ref, {
      uid,
      displayName: user.displayName ?? '',
      photoUrl: user.photoUrl ?? '',
      ...fields,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    console.warn('[records] publish failed', e)
  }
}

/**
 * Call right after a workout is saved: announces personal records the workout
 * set, then syncs badges. Never throws (gamification must not break saving).
 */
export async function afterWorkoutSaved(uid: string, workoutId: string): Promise<void> {
  try {
    const data = await loadBadgeData(uid)
    const workouts = data.workouts
    const before = computeRecords(workouts.filter(w => w.id !== workoutId))
    const latest = workouts.find(w => w.id === workoutId)
    if (latest) {
      const after = computeRecords([latest])
      for (const lift of LIFTS) {
        const v = after[lift.key].value
        const prev = before[lift.key].value
        // Only celebrate an improvement on an existing record, not a first log.
        if (v > 0 && prev > 0 && v > prev) {
          await createNotification(uid, 'NEW_RECORD',
            `🏆 Record nou: ${lift.name.RO}`,
            `${formatRecordValue(v, lift.metric)}${lift.metric === 'reps' ? ' rep' : ''} (înainte: ${formatRecordValue(prev, lift.metric)})`,
            lift.key, uid)
        }
      }
    }
    if (latest) await checkChallenges(uid, latest)
    await syncBadges(uid, data)
    const userSnap = await getDoc(doc(db, 'users', uid))
    await publishRecords(uid, (userSnap.data() ?? {}) as Partial<UserDoc>, workouts)
  } catch (e) {
    console.warn('[badges] post-workout sync failed', e)
  }
}

