'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { SkillDef, SkillCategory } from '@/types'
import { SKILLS, SKILL_LEVEL_ORDER } from '@/lib/skills'
import { awardCoins, checkSkillMilestones } from '@/lib/coins'
import { ArrowLeft } from 'lucide-react'

const CATEGORIES: SkillCategory[] = ['STRENGTH', 'MOBILITY', 'CARDIO']

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  STRENGTH: 'Forță',
  MOBILITY: 'Mobilitate',
  CARDIO: 'Cardio',
}

const LEVEL_TITLES = [
  { min: 1, max: 2, label: 'Începător' },
  { min: 3, max: 5, label: 'Antrenat' },
  { min: 6, max: 9, label: 'Avansat' },
  { min: 10, max: 14, label: 'Expert' },
  { min: 15, max: Infinity, label: 'Elite' },
]

function getLevelTitle(level: number): string {
  return LEVEL_TITLES.find(t => level >= t.min && level <= t.max)?.label ?? 'Elite'
}

export default function SkillsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [unlockedSkills, setUnlockedSkills] = useState<Set<string>>(new Set())
  const [unlocking, setUnlocking] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory>('STRENGTH')
  const [coins, setCoins] = useState(0)

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'skills'), snap => {
      setUnlockedSkills(new Set(snap.docs.map(d => d.id)))
    })
    return unsub
  }, [user])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) setCoins(snap.data().coins ?? 0)
    })
    return unsub
  }, [user])

  async function markSkillDone(skill: SkillDef) {
    if (!user || unlocking) return
    setUnlocking(skill.id)
    try {
      await setDoc(doc(db, 'users', user.uid, 'skills', skill.id), {
        skillId: skill.id,
        unlockedAt: serverTimestamp(),
      })
      const newTotal = unlockedSkills.size + 1
      await awardCoins(user.uid, 'SKILL_UNLOCKED', skill.coinsReward)
      await checkSkillMilestones(user.uid, newTotal)
    } finally {
      setUnlocking(null)
    }
  }

  const level = Math.floor(coins / 100) + 1
  const xpInLevel = coins % 100
  const levelTitle = getLevelTitle(level)

  const filteredSkills = SKILLS
    .filter(s => s.category === selectedCategory)
    .sort((a, b) => SKILL_LEVEL_ORDER[a.level] - SKILL_LEVEL_ORDER[b.level])

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Skill Tree</h1>
        </div>

        {/* XP Level Card */}
        <div className="rounded-2xl p-4 mb-5 flex items-center gap-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#3B82F6' }}
          >
            <span className="text-xl font-black text-white">{level}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-black text-white text-sm">{levelTitle}</p>
              <p className="text-xs text-white/35">Nivel {level}</p>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${xpInLevel}%`, backgroundColor: '#3B82F6' }}
              />
            </div>
            <p className="text-[10px] text-white/30 mt-1">{xpInLevel} / 100 XP • {coins} monede total</p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-1 h-9 rounded-full text-xs font-bold transition-colors ${
                selectedCategory === cat
                  ? 'bg-brand-green text-black'
                  : 'bg-white/8 text-white/60 border border-white/10'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Vertical tree */}
        <div>
          {filteredSkills.map((skill, idx) => {
            const isUnlocked = unlockedSkills.has(skill.id)
            const prereqsMet = skill.requirements.every(r => unlockedSkills.has(r))
            const isLocked = !isUnlocked && !prereqsMet
            const isLast = idx === filteredSkills.length - 1

            // Node visual state
            let nodeBg: string
            let nodeBorder: string
            let lineColor: string
            let lineDashed: boolean

            if (isUnlocked) {
              nodeBg = '#1ED75F'
              nodeBorder = 'none'
              lineColor = '#1ED75F'
              lineDashed = false
            } else if (prereqsMet) {
              nodeBg = 'transparent'
              nodeBorder = '2px solid #3B82F6'
              lineColor = '#3B82F6'
              lineDashed = false
            } else {
              nodeBg = 'rgba(255,255,255,0.08)'
              nodeBorder = 'none'
              lineColor = 'rgba(255,255,255,0.12)'
              lineDashed = true
            }

            return (
              <div key={skill.id} className="flex gap-3">
                {/* Node column */}
                <div className="flex flex-col items-center" style={{ width: 22, flexShrink: 0 }}>
                  {/* Circle node */}
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 z-10"
                    style={{
                      backgroundColor: nodeBg,
                      border: nodeBorder,
                      marginTop: 16,
                    }}
                  />
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div
                      className="w-0.5 flex-1"
                      style={{
                        minHeight: 20,
                        backgroundImage: lineDashed
                          ? `repeating-linear-gradient(to bottom, ${lineColor} 0px, ${lineColor} 4px, transparent 4px, transparent 8px)`
                          : 'none',
                        backgroundColor: lineDashed ? 'transparent' : lineColor,
                      }}
                    />
                  )}
                </div>

                {/* Skill card */}
                <div
                  className="flex-1 rounded-2xl p-3.5 mb-3"
                  style={{ backgroundColor: 'var(--app-surface)' }}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-bold text-white">
                          {skill.icon} {skill.name}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: '#1ED75F18', color: '#1ED75F' }}>
                          +{skill.coinsReward} 🪙
                        </span>
                      </div>
                      <p className="text-xs text-white/45 leading-relaxed">{skill.description}</p>
                      {isLocked && skill.requirements.length > 0 && (
                        <p className="text-[10px] text-white/25 mt-1">
                          🔒 Necesită:{' '}
                          {skill.requirements
                            .map(r => SKILLS.find(s => s.id === r)?.name)
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex-shrink-0 pt-0.5">
                      {isUnlocked ? (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: '#1ED75F' }}
                        >
                          <span className="text-black text-xs font-black">✓</span>
                        </div>
                      ) : prereqsMet ? (
                        <button
                          onClick={() => markSkillDone(skill)}
                          disabled={unlocking === skill.id}
                          className="h-8 px-3 rounded-full text-xs font-bold text-black bg-brand-green disabled:opacity-50 whitespace-nowrap"
                        >
                          {unlocking === skill.id ? '...' : '✓ Am reușit'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
