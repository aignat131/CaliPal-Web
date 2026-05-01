'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from './useAuth'
import type { UserDoc } from '@/types'

/**
 * Returns the current user's Firestore profile.
 * Falls back to Firebase Auth values when the profile is still loading.
 */
export function useMyProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserDoc | null>(null)

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() } as UserDoc)
    })
    return unsub
  }, [user])

  const DEFAULT_DISPLAY_NAME = 'Utilizator'
  const storedName = profile?.displayName
  const authName = user?.displayName || ''
  // Never return an empty string — fall back through: stored → auth → default
  const displayName = (storedName && storedName !== DEFAULT_DISPLAY_NAME)
    ? storedName
    : (authName || DEFAULT_DISPLAY_NAME)

  return {
    displayName,
    photoUrl: profile?.photoUrl || user?.photoURL || '',
    profile,
  }
}
