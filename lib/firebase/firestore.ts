import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { app } from './config'
import type { UserDoc } from '@/types'

if (!app) throw new Error('Firebase failed to initialize. Check NEXT_PUBLIC_FIREBASE_* env vars.')
export const db = getFirestore(app)

/** Create user document on first sign-up. Safe to call multiple times. Also fixes incorrect displayNames. */
export async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Utilizator',
      email: user.email ?? '',
      bio: '',
      isCoach: false,
      photoUrl: user.photoURL ?? '',
      totalWorkouts: 0,
      currentStreak: 0,
      coins: 0,
      friendCount: 0,
      assessmentCompleted: false,
      joinedCommunityIds: [],
      createdAt: serverTimestamp(),
    } satisfies Omit<UserDoc, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> })
  } else {
    // Fix displayName if it was stored as 'Utilizator' or is missing
    const stored = snap.data().displayName as string | undefined
    const betterName = user.displayName || user.email?.split('@')[0]
    if (betterName && (!stored || stored === 'Utilizator')) {
      await updateDoc(ref, { displayName: betterName })
    }
  }
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return { uid: snap.id, ...snap.data() } as UserDoc
}

export async function updateUserDoc(uid: string, data: Partial<UserDoc>): Promise<void> {
  await updateDoc(doc(db, 'users', uid), data as Record<string, unknown>)
}

export { doc, collection, getDoc, setDoc, updateDoc, addDoc, serverTimestamp }
