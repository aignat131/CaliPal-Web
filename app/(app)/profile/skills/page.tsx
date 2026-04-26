'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { UnlockedSkill, SkillDef } from '@/types'
import { SKILLS, SKILL_LEVEL_LABELS, SKILL_LEVEL_COLORS, SKILL_LEVEL_ORDER } from '@/lib/skills'
import { awardCoins, checkSkillMilestones } from '@/lib/coins'
import { ArrowLeft, Lock, Check } from 'lucide-react'

export default function SkillsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [unlockedSkills, setUnlockedSkills] = useState<Set<string>>(new Set())
  const [unlocking, setUnlocking] = useState<string | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL')

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'skills'), snap => {
      setUnlockedSkills(new Set(snap.docs.map(d => d.id)))
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
      const coins = await awardCoins(user.uid, 'SKILL_UNLOCKED', skill.coinsReward)
      await checkSkillMilestones(user.uid, newTotal)
    } finally {
      setUnlocking(null)
    }
  }

  const levels = ['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ELITE']

  const filtered = SKILLS
    .filter(s => selectedLevel === 'ALL' || s.level === selectedLevel)
    .sort((a, b) => SKILL_LEVEL_ORDER[a.level] - SKILL_LEVEL_ORDER[b.level])

  const unlockedCount = unlockedSkills.size
  const totalCount = SKILLS.length
  const pct = Math.round((unlockedCount / totalCount) * 100)

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Skill Tree</h1>
        </div>

        {/* Progress bar */}
        <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-white">Progres total</p>
            <p className="text-sm font-black text-brand-green">{unlockedCount}/{totalCount}</p>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Level filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {levels.map(l => (
            <button
              key={l}
              onClick={() => setSelectedLevel(l)}
              className={`flex-shrink-0 h-7 px-3 rounded-full text-xs font-semibold transition-colors ${
                selectedLevel === l
                  ? 'bg-brand-green text-black'
                  : 'bg-white/8 text-white/60 border border-white/10'
              }`}
            >
              {l === 'ALL' ? 'Toate' : SKILL_LEVEL_LABELS[l]}
            </button>
          ))}
        </div>

        {/* Skills grid */}
        <div className="flex flex-col gap-2">
          {filtered.map(skill => {
            const isUnlocked = unlockedSkills.has(skill.id)
            const prereqsMet = skill.requirements.every(r => unlockedSkills.has(r))
            const isLocked = !isUnlocked && !prereqsMet
            const levelColor = SKILL_LEVEL_COLORS[skill.level]

            return (
              <div
                key={skill.id}
                className={`rounded-2xl p-4 transition-opacity ${isLocked ? 'opacity-50' : ''}`}
                style={{ backgroundColor: 'var(--app-surface)' }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                    style={{
                      backgroundColor: isUnlocked ? `${levelColor}33` : 'rgba(255,255,255,0.05)',
                      border: isUnlocked ? `1px solid ${levelColor}66` : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {isLocked ? <Lock size={18} className="text-white/30" /> : skill.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-bold ${isUnlocked ? 'text-white' : 'text-white/70'}`}>
                        {skill.name}
                      </p>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${levelColor}33`, color: levelColor }}
                      >
                        {SKILL_LEVEL_LABELS[skill.level]}
                      </span>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed">{skill.description}</p>
                    {skill.requirements.length > 0 && !isUnlocked && (
                      <p className="text-[10px] text-white/30 mt-1">
                        Necesită: {skill.requirements.map(r => SKILLS.find(s => s.id === r)?.name).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Status / unlock button */}
                  <div className="flex-shrink-0">
                    {isUnlocked ? (
                      <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center">
                        <Check size={15} className="text-black" strokeWidth={3} />
                      </div>
                    ) : prereqsMet ? (
                      <button
                        onClick={() => markSkillDone(skill)}
                        disabled={unlocking === skill.id}
                        className="h-8 px-3 rounded-full text-xs font-bold text-black bg-brand-green disabled:opacity-50"
                      >
                        {unlocking === skill.id ? '...' : '✓ Am reușit'}
                      </button>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        <Lock size={12} className="text-white/25" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Coin reward */}
                <div className="flex items-center gap-1 mt-2 ml-15">
                  <span className="text-[10px] text-white/25">🪙 +{skill.coinsReward} monede la deblocare</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
