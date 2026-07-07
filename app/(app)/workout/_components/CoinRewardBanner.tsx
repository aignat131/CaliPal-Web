'use client'

import { useEffect, useState } from 'react'

export function CoinRewardBanner({ coins }: { coins: number }) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 600)
    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => setMounted(false), 500)
    }, 4600)
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer) }
  }, [])

  if (!mounted || coins <= 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        className="mt-3 px-5 py-3 rounded-2xl shadow-xl pointer-events-auto flex items-center gap-3"
        style={{
          background: 'linear-gradient(135deg, #78530a 0%, #b8860b 50%, #daa520 100%)',
          border: '1px solid rgba(255, 215, 0, 0.4)',
        }}
      >
        <span className="text-2xl">&#x1FA99;</span>
        <div>
          <p className="text-base font-black text-white">+{coins} monede</p>
          <p className="text-xs text-white/70">Recompens&#x103; antrenament</p>
        </div>
      </div>
    </div>
  )
}
