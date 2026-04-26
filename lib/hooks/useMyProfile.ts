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

  const storedName = profile?.displayName
  const authName = user?.displayName || ''
  // Don't use 'Utilizator' as a real name — fall back to auth name
  const displayName = storedName && storedName !== 'Utilizator' ? storedName : (authName || storedName || '')

  return {
    displayName,
    photoUrl: profile?.photoUrl || user?.photoURL || '',
    profile,
  }
}
