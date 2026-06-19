'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    if (!auth) { setLoading(false); return }
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const result = await u.getIdTokenResult(true)
        setIsSuperAdmin(result.claims.superAdmin === true)
      } else {
        setIsSuperAdmin(false)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { user, loading, isSuperAdmin }
}
