'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { DEFAULT_SKILL_CATEGORIES } from '@/lib/data/skillCategories'
import type {
  BasicStrength, SkillsByCategory, SkillItem,
  CalisthenicsLevel, PushupType, PullupType, CardioFrequency,
} from '@/types'
import { ArrowLeft } from 'lucide-react'

// ── Level label helpers ───────────────────────────────────────────────────────

const LEVEL_LABELS: Record<CalisthenicsLevel, string> = {
  beginner:     '⚔️ Începător',
  intermediate: '🔵 Intermediar',
  advanced:     '🟣 Avansat',
  elite:        '🏆 Elite',
}
const PUSHUP_LABELS: Record<PushupType, string> = {
  none: '—', knee: 'Cu genunchii', regular: 'Normale',
}
const PULLUP_LABELS: Record<PullupType, string> = {
  none: '—', australian: 'Australian', regular: 'Complete',
}
const CARDIO_LABELS: Record<CardioFrequency, string> = {
  never: 'Niciodată', rarely: 'Rar', regular: 'Regulat', daily: 'Zilnic',
}

type SkillZone = 'NONE' | 'HAVE' | 'WANT' | 'CLOSE'

function getZone(assignments: SkillsByCategory, catId: string, skillId: string): SkillZone {
  const cat = assignments[catId]
  if (!cat) return 'NONE'
  if (cat.have.some(s => s.id === skillId)) return 'HAVE'
  if (cat.wantToLearn.some(s => s.id === skillId)) return 'WANT'
  if (cat.close?.some(s => s.id === skillId)) return 'CLOSE'
  return 'NONE'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [basicStrength, setBasicStrength] = useState<BasicStrength | null>(null)
  const [assignments, setAssignments] = useState<SkillsByCategory>({})
  const [assessmentCompleted, setAssessmentCompleted] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState<string>(DEFAULT_SKILL_CATEGORIES[0].id)
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (!snap.exists()) return
      const data = snap.data()
      setAssessmentCompleted(data.assessmentCompleted ?? false)
      setBasicStrength(data.basicStrength ?? null)
      setAssignments(data.skillsByCategory ?? {})
    })
    return unsub
  }, [user])

  const totalHave  = Object.values(assignments).reduce((sum, v) => sum + v.have.length, 0)
  const totalWant  = Object.values(assignments).reduce((sum, v) => sum + v.wantToLearn.length, 0)
  const totalClose = Object.values(assignments).reduce((sum, v) => sum + (v.close?.length ?? 0), 0)

  if (!assessmentCompleted) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: 'var(--app-bg)' }}>
        <p className="text-4xl mb-4">🏋️</p>
        <h2 className="text-xl font-black text-white mb-2">Fă evaluarea mai întâi</h2>
        <p className="text-white/50 text-sm mb-6 max-w-xs">
          Completează evaluarea fizică pentru a vedea și gestiona skill-urile tale.
        </p>
        <button onClick={() => router.push('/profile/assessment')}
          className="h-12 px-8 rounded-full bg-brand-green text-black font-bold">
          Începe evaluarea →
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Skill-urile mele</h1>
        </div>

        {/* Basic strength summary card */}
        {basicStrength && (
          <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-xs font-bold text-white/40 tracking-widest mb-3">PROFIL FIZIC</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatItem label="Nivel" value={LEVEL_LABELS[basicStrength.level] ?? basicStrength.level} />
              <StatItem label="Cardio" value={CARDIO_LABELS[basicStrength.cardio] ?? basicStrength.cardio} />
              <StatItem
                label="Flotări"
                value={basicStrength.pushups.type === 'none'
                  ? '—'
                  : `${PUSHUP_LABELS[basicStrength.pushups.type]} × ${basicStrength.pushups.count}`}
              />
              <StatItem
                label="Tracțiuni"
                value={basicStrength.pullups.type === 'none'
                  ? '—'
                  : `${PULLUP_LABELS[basicStrength.pullups.type]} × ${basicStrength.pullups.count}`}
              />
              <StatItem label="Squats" value={`${basicStrength.squats.count} rep`} />
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-2xl font-black text-brand-green">{totalHave}</p>
            <p className="text-xs text-white/50">stăpânite</p>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--app-surface)' }}>
            <p className="text-2xl font-black text-blue-400">{totalWant}</p>
            <p className="text-xs text-white/50">de învățat</p>
          </div>
          {totalClose > 0 && (
            <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--app-surface)' }}>
              <p className="text-2xl font-black text-amber-400">{totalClose}</p>
              <p className="text-xs text-white/50">aproape</p>
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {DEFAULT_SKILL_CATEGORIES.map(cat => (
            <button key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
              className={`shrink-0 px-4 h-8 rounded-full text-xs font-bold transition-colors ${
                selectedCatId === cat.id
                  ? 'bg-brand-green text-black'
                  : 'bg-white/8 text-white/60 border border-white/12'
              }`}>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Skill grid for selected category */}
        {DEFAULT_SKILL_CATEGORIES.map(cat => {
          if (cat.id !== selectedCatId) return null
          const userCat = assignments[cat.id] ?? { have: [], wantToLearn: [] }
          const customSkills: SkillItem[] = [
            ...userCat.have.filter(s => s.id.startsWith('custom_')),
            ...userCat.wantToLearn.filter(s => s.id.startsWith('custom_')),
            ...(userCat.close ?? []).filter(s => s.id.startsWith('custom_')),
          ].filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)

          const allSkills = [...cat.skills, ...customSkills]

          return (
            <div key={cat.id}>
              {/* Category question */}
              <p className="text-xs text-white/40 mb-3">{cat.question}</p>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-xs text-white/50">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-brand-green inline-block" />
                  Stăpânesc
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                  Vreau să învăț
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  Aproape
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {allSkills.map(skill => {
                  const zone = getZone(assignments, cat.id, skill.id)
                  return (
                    <span key={skill.id}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold ${
                        zone === 'HAVE'
                          ? 'bg-brand-green text-black'
                          : zone === 'WANT'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                            : zone === 'CLOSE'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-white/8 text-white/60 border border-white/12'
                      }`}>
                      {skill.name}
                    </span>
                  )
                })}
              </div>

              <p className="text-xs text-white/30 mt-4">
                Refă evaluarea pentru a modifica skill-urile tale.
              </p>
            </div>
          )
        })}

        {/* Re-assess CTA */}
        <div className="mt-8 pt-4 border-t border-white/8">
          <p className="text-xs text-white/35 text-center mb-3">Skill-urile sunt blocate după evaluare. Refă testul pentru a le actualiza.</p>
          <button onClick={() => router.push('/profile/assessment')}
            className="w-full h-11 rounded-2xl bg-brand-green text-black text-sm font-black">
            Refă evaluarea →
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
      <p className="text-white/40 text-[10px] mb-0.5">{label}</p>
      <p className="text-white font-semibold text-xs">{value}</p>
    </div>
  )
}
