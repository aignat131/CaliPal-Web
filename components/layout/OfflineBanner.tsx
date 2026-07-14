'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

export default function OfflineBanner() {
  const t = useT()
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)
    const handleOffline = () => setOffline(true)
    const handleOnline = () => setOffline(false)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9000] flex items-center justify-center gap-2 py-2 px-4 bg-red-500/90 backdrop-blur-sm">
      <WifiOff size={14} className="text-white flex-shrink-0" />
      <p className="text-xs font-bold text-white">{t('layout.offline')}</p>
    </div>
  )
}
