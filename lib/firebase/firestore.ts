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

// app is null during SSR/build when env vars are absent — skip init, runtime always has them
export const db = app ? getFirestore(app) : null!

/** Create user document on first sign-up. Safe to call multiple times.
 *  Also syncs photoUrl and displayName from Firebase Auth on every login
 *  and propagates changes to community member docs. */
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
    const data = snap.data()
    const patch: Record<string, string> = {}

    // Sync displayName from Auth if stored name is missing/default
    const storedName = data.displayName as string | undefined
    const authName = user.displayName || user.email?.split('@')[0]
    if (authName && (!storedName || storedName === 'Utilizator')) {
      patch.displayName = authName
    }

    // Sync photoUrl from Auth — catches Google profile picture changes.
    // Only overwrite if the user hasn't uploaded a custom photo (Firebase Storage).
    const storedPhoto = data.photoUrl as string | undefined
    const authPhoto = user.photoURL ?? ''
    const hasCustomUpload = storedPhoto && storedPhoto.includes('firebasestorage.googleapis.com')
    if (authPhoto && authPhoto !== storedPhoto && !hasCustomUpload) {
      patch.photoUrl = authPhoto
    }

    if (Object.keys(patch).length > 0) {
      await updateDoc(ref, patch)

      // Propagate photo/name changes to all community member docs
      const communityIds = (data.joinedCommunityIds as string[] | undefined) ?? []
      if (communityIds.length > 0) {
        await Promise.allSettled(
          communityIds.map(cid =>
            updateDoc(doc(db, 'communities', cid, 'members', user.uid), patch).catch(() => {})
          )
        )
      }
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
