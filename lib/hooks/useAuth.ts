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
      if (u) {
        try {
          const result = await u.getIdTokenResult(true)
          setIsSuperAdmin(result.claims.superAdmin === true)
        } catch {
          setIsSuperAdmin(false)
        }
        setUser(u)
      } else {
        setIsSuperAdmin(false)
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { user, loading, isSuperAdmin }
}
