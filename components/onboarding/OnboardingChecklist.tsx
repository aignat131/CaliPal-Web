'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, ChevronUp, X, Coins } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import type { UserDoc } from '@/types'

interface Step {
  key: string
  labelKey: string
  coins: number
  href: string
  done: boolean
}

const DISMISSED_KEY = 'calipal_onboarding_dismissed'
const COLLAPSED_KEY = 'calipal_onboarding_collapsed'
const PARK_VISITED_KEY = 'calipal_park_visited'

export default function OnboardingChecklist({ userDoc }: { userDoc: UserDoc }) {
  const t = useT()
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash
  const [collapsed, setCollapsed] = useState(false)
  const [parkVisited, setParkVisited] = useState(false)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === '1')
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
    setParkVisited(localStorage.getItem(PARK_VISITED_KEY) === '1')
  }, [])

  const steps: Step[] = [
    { key: 'assessment', labelKey: 'onboarding.step_assessment', coins: 25, href: '/profile/assessment', done: userDoc.assessmentCompleted },
    { key: 'community',  labelKey: 'onboarding.step_community',  coins: 5,  href: '/community',          done: (userDoc.joinedCommunityIds?.length ?? 0) > 0 },
    { key: 'workout',    labelKey: 'onboarding.step_workout',    coins: 20, href: '/workout',             done: userDoc.totalWorkouts >= 1 },
    { key: 'friend',     labelKey: 'onboarding.step_friend',     coins: 5,  href: '/profile/friends',     done: userDoc.friendCount >= 1 },
    { key: 'map',        labelKey: 'onboarding.step_map',        coins: 0,  href: '/map',                 done: parkVisited },
  ]

  const doneCount = steps.filter(s => s.done).length
  const totalCoins = steps.reduce((sum, s) => sum + s.coins, 0)
  const allDone = doneCount === steps.length

  if (dismissed || allDone) return null

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
  }

  return (
    <div
      className="rounded-2xl p-4 mb-4 border border-brand-green/30"
      style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.05) 0%, rgba(13,61,40,0.05) 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={toggleCollapse} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-sm">{t('onboarding.title')}</p>
            <p className="text-xs text-white/50 mt-0.5">
              {t('onboarding.progress').replace('{done}', String(doneCount)).replace('{total}', String(steps.length))}
              {totalCoins > 0 && (
                <span className="ml-2 text-amber-400">
                  {t('onboarding.coins_total').replace('{n}', String(totalCoins))}
                </span>
              )}
            </p>
          </div>
          {collapsed ? <ChevronDown size={16} className="text-white/40" /> : <ChevronUp size={16} className="text-white/40" />}
        </button>
        <button onClick={handleDismiss} className="ml-2 p-1 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/60 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-green transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps (collapsible) */}
      {!collapsed && (
        <div className="mt-3 flex flex-col gap-1">
          {steps.map((step) => (
            <Link
              key={step.key}
              href={step.done ? '#' : step.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${step.done ? 'opacity-50' : 'hover:bg-white/5 active:bg-white/8'}`}
              onClick={step.done ? (e) => e.preventDefault() : undefined}
            >
              {/* Checkbox */}
              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${step.done ? 'bg-brand-green' : 'border border-white/20'}`}>
                {step.done && <Check size={12} className="text-black" strokeWidth={3} />}
              </div>

              {/* Label */}
              <span className={`flex-1 text-sm ${step.done ? 'text-white/50 line-through' : 'text-white font-medium'}`}>
                {t(step.labelKey)}
              </span>

              {/* Coin badge */}
              {step.coins > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-400/80">
                  <Coins size={12} />
                  {step.coins}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
