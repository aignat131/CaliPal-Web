'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface FirstTimeHintProps {
  storageKey: string
  children: ReactNode
  position?: 'top' | 'bottom'
  delay?: number
}

export default function FirstTimeHint({ storageKey, children, position = 'bottom', delay = 800 }: FirstTimeHintProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(storageKey)) return
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [storageKey, delay])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  return (
    <div className={`absolute left-1/2 -translate-x-1/2 z-50 ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
      <div className="relative bg-brand-green text-black rounded-xl px-3.5 py-2.5 shadow-lg max-w-[260px] animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Arrow */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-brand-green rotate-45 ${position === 'top' ? 'bottom-[-5px]' : 'top-[-5px]'}`}
        />
        <div className="flex items-start gap-2">
          <p className="text-xs font-medium leading-relaxed flex-1">{children}</p>
          <button onClick={dismiss} className="flex-shrink-0 mt-0.5 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
