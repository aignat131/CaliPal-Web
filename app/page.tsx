'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

export default function RootPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (user) {
      router.replace('/home')
    } else {
      const hasSeenIntro = localStorage.getItem('calipal_intro_done')
      router.replace(hasSeenIntro ? '/login' : '/intro')
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-brand-darkBg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
