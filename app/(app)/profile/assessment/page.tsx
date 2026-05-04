'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { awardCoins, checkSkillMilestones } from '@/lib/gamification/coins'
import { loadSkillCategories } from '@/lib/data/skillCategories'
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react'
import type {
  CalisthenicsLevel, PushupType, PullupType, CardioFrequency,
  SkillCategoryDef, SkillItem, UserSkillData, SkillsByCategory,
} from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BasicStrengthState {
  level:        CalisthenicsLevel | null
  pushupsType:  PushupType
  pushupsCount: number
  pullupsType:  PullupType
  pullupsCount: number
  squatsCount:  number
  cardio:       CardioFrequency | null
}

type SkillZone = 'NONE' | 'HAVE' | 'WANT'

// ── Helpers ───────────────────────────────────────────────────────────────────

function cycleSkillInCategory(
  assignments: SkillsByCategory,
  categoryId: string,
  skill: SkillItem,
): SkillsByCategory {
  const current: UserSkillData = assignments[categoryId] ?? { have: [], wantToLearn: [] }
  const inHave = current.have.some(s => s.id === skill.id)
  const inWant = current.wantToLearn.some(s => s.id === skill.id)
  let updated: UserSkillData
  if (!inHave && !inWant) {
    // unselected → HAVE
    updated = { ...current, have: [...current.have, skill] }
  } else if (inHave) {
    // HAVE → WANT
    updated = {
      have: current.have.filter(s => s.id !== skill.id),
      wantToLearn: [...current.wantToLearn, skill],
    }
  } else {
    // WANT → unselected
    updated = { ...current, wantToLearn: current.wantToLearn.filter(s => s.id !== skill.id) }
  }
  return { ...assignments, [categoryId]: updated }
}

function getSkillZone(assignments: SkillsByCategory, categoryId: string, skillId: string): SkillZone {
  const cat = assignments[categoryId]
  if (!cat) return 'NONE'
  if (cat.have.some(s => s.id === skillId)) return 'HAVE'
  if (cat.wantToLearn.some(s => s.id === skillId)) return 'WANT'
  return 'NONE'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssessmentPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [categories, setCategories] = useState<SkillCategoryDef[]>([])
  const [loadingCats, setLoadingCats] = useState(true)

  const [step, setStep] = useState(0)
  // Steps: 0=intro, 1=level, 2=pushups, 3=pullups, 4=squats, 5=cardio,
  //        6..6+N-1=skill categories, 6+N=results
  const [strength, setStrength] = useState<BasicStrengthState>({
    level: null, pushupsType: 'none', pushupsCount: 0,
    pullupsType: 'none', pullupsCount: 0, squatsCount: 0, cardio: null,
  })
  const [assignments, setAssignments] = useState<SkillsByCategory>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [coinsEarned, setCoinsEarned] = useState(0)

  const SKILL_STEP_OFFSET = 6
  const totalSteps = SKILL_STEP_OFFSET + categories.length + 1 // +1 for results

  // Load categories & pre-fill if re-assessing
  useEffect(() => {
    async function init() {
      const cats = await loadSkillCategories(db)
      setCategories(cats)
      setLoadingCats(false)

      if (!user) return
      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (!snap.exists() || snap.data().assessmentCompleted !== true) return
        const data = snap.data()
        const bs = data.basicStrength ?? {}
        const pu = bs.pushups ?? {}
        const pl = bs.pullups ?? {}
        const sq = bs.squats ?? {}
        setStrength({
          level:        bs.level ?? null,
          pushupsType:  pu.type ?? 'none',
          pushupsCount: pu.count ?? 0,
          pullupsType:  pl.type ?? 'none',
          pullupsCount: pl.count ?? 0,
          squatsCount:  sq.count ?? 0,
          cardio:       bs.cardio ?? null,
        })
        setAssignments(data.skillsByCategory ?? {})
      } catch { /* best-effort pre-fill */ }
    }
    init()
  }, [user])

  function goNext() { setStep(s => Math.min(s + 1, totalSteps - 1)) }
  function goBack() {
    if (step === 0) { router.back(); return }
    setStep(s => s - 1)
  }

  function cycleSkill(categoryId: string, skill: SkillItem) {
    setAssignments(prev => cycleSkillInCategory(prev, categoryId, skill))
  }

  function addCustomSkill(categoryId: string) {
    const name = (customInputs[categoryId] ?? '').trim()
    if (!name) return
    const skill: SkillItem = { id: `custom_${Date.now()}`, name }
    setAssignments(prev => {
      const current = prev[categoryId] ?? { have: [], wantToLearn: [] }
      return { ...prev, [categoryId]: { ...current, wantToLearn: [...current.wantToLearn, skill] } }
    })
    setCustomInputs(prev => ({ ...prev, [categoryId]: '' }))
  }

  async function save() {
    if (!user || saving) return
    setSaving(true)
    try {
      const totalHave = Object.values(assignments).reduce((sum, v) => sum + v.have.length, 0)
      await updateDoc(doc(db, 'users', user.uid), {
        assessmentCompleted: true,
        basicStrength: {
          level:   strength.level ?? 'beginner',
          pushups: { type: strength.pushupsType,  count: strength.pushupsCount },
          pullups: { type: strength.pullupsType,  count: strength.pullupsCount },
          squats:  { count: strength.squatsCount },
          cardio:  strength.cardio ?? 'never',
        },
        skillsByCategory: Object.fromEntries(
          Object.entries(assignments).map(([catId, data]) => [
            catId,
            {
              have:        data.have.map(s => ({ id: s.id, name: s.name })),
              wantToLearn: data.wantToLearn.map(s => ({ id: s.id, name: s.name })),
            },
          ])
        ),
      })
      const coins = await awardCoins(user.uid, 'COMPLETE_ASSESSMENT')
      await checkSkillMilestones(user.uid, totalHave)
      setCoinsEarned(coins)
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  // Trigger save when reaching Results step
  useEffect(() => {
    if (step === totalSteps - 1 && totalSteps > 1 && !saving && !done) {
      save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (loadingCats) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Results screen ───────────────────────────────────────────────────────────
  if (step === totalSteps - 1) {
    const totalHave = Object.values(assignments).reduce((sum, v) => sum + v.have.length, 0)
    const totalWant = Object.values(assignments).reduce((sum, v) => sum + v.wantToLearn.length, 0)
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6" style={{ backgroundColor: 'var(--app-bg)' }}>
        {saving ? (
          <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin mb-4" />
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mx-auto mb-4">
              <Check size={40} className="text-black" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-black text-white mb-1 text-center">Evaluare completă!</h2>
            <p className="text-white/50 text-sm mb-6 text-center">Profilul tău a fost salvat</p>

            <div className="w-full max-w-sm rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex gap-6 justify-center mb-3">
                <div className="text-center">
                  <p className="text-2xl font-black text-brand-green">{totalHave}</p>
                  <p className="text-xs text-white/50">stăpânite</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-blue-400">{totalWant}</p>
                  <p className="text-xs text-white/50">de învățat</p>
                </div>
              </div>
              {coinsEarned > 0 && (
                <p className="text-sm text-white/60 text-center">
                  🪙 Ai câștigat <span className="text-brand-green font-bold">+{coinsEarned} monede</span>!
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 w-full max-w-sm">
              <button onClick={() => router.push('/profile/skills')}
                className="w-full h-12 rounded-full bg-brand-green text-black font-bold">
                Vezi skill-urile mele →
              </button>
              <button onClick={() => router.push('/profile')}
                className="w-full h-12 rounded-full border border-white/20 text-white/70 font-semibold text-sm">
                Înapoi la profil
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const progress = step / (totalSteps - 1)

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={goBack}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          {step > 0 && (
            <div className="flex-1">
              <div className="flex justify-between text-xs text-white/40 mb-1">
                <span>Pasul {step} din {totalSteps - 2}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-brand-green transition-all"
                  style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Steps */}
        {step === 0 && <StepIntro onStart={() => setStep(1)} />}
        {step === 1 && (
          <StepLevel value={strength.level}
            onChange={level => { setStrength(s => ({ ...s, level })); goNext() }} />
        )}
        {step === 2 && (
          <StepPushups
            type={strength.pushupsType} count={strength.pushupsCount}
            onChange={(type, count) => setStrength(s => ({ ...s, pushupsType: type, pushupsCount: count }))}
            onNext={goNext} />
        )}
        {step === 3 && (
          <StepPullups
            type={strength.pullupsType} count={strength.pullupsCount}
            onChange={(type, count) => setStrength(s => ({ ...s, pullupsType: type, pullupsCount: count }))}
            onNext={goNext} />
        )}
        {step === 4 && (
          <StepSquats
            count={strength.squatsCount}
            onChange={count => setStrength(s => ({ ...s, squatsCount: count }))}
            onNext={goNext} />
        )}
        {step === 5 && (
          <StepCardio value={strength.cardio}
            onChange={cardio => { setStrength(s => ({ ...s, cardio })); goNext() }} />
        )}
        {step >= SKILL_STEP_OFFSET && step < totalSteps - 1 && (() => {
          const cat = categories[step - SKILL_STEP_OFFSET]
          if (!cat) return null
          return (
            <StepSkillCategory
              category={cat}
              assignments={assignments}
              customInput={customInputs[cat.id] ?? ''}
              onCycleSkill={skill => cycleSkill(cat.id, skill)}
              onCustomInputChange={val => setCustomInputs(prev => ({ ...prev, [cat.id]: val }))}
              onAddCustom={() => addCustomSkill(cat.id)}
              onNext={goNext} />
          )
        })()}

      </div>
    </div>
  )
}

// ── Step: Intro ───────────────────────────────────────────────────────────────

function StepIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center pt-12">
      <div className="w-20 h-20 rounded-3xl bg-brand-green/15 flex items-center justify-center mb-6">
        <span className="text-4xl">🏋️</span>
      </div>
      <h1 className="text-2xl font-black text-white mb-2">Evaluare fizică</h1>
      <p className="text-white/50 text-sm leading-relaxed mb-10 max-w-xs">
        Hai să aflăm nivelul tău actual pentru a-ți personaliza experiența în aplicație.
      </p>
      <button onClick={onStart}
        className="w-full max-w-xs h-13 rounded-full font-bold text-black bg-brand-green flex items-center justify-center gap-2"
        style={{ height: 52 }}>
        <span>Începe evaluarea</span>
        <ArrowRight size={16} />
      </button>
    </div>
  )
}

// ── Step: Level ───────────────────────────────────────────────────────────────

const LEVELS: { value: CalisthenicsLevel; label: string; desc: string; emoji: string }[] = [
  { value: 'beginner',     label: 'Începător',   desc: 'Abia am început sau nu am experiență', emoji: '⚔️' },
  { value: 'intermediate', label: 'Intermediar', desc: 'Câteva luni de antrenament',           emoji: '🔵' },
  { value: 'advanced',     label: 'Avansat',     desc: 'Ani de practică regulată',             emoji: '🟣' },
  { value: 'elite',        label: 'Elite',        desc: 'Mișcări avansate stăpânite',           emoji: '🏆' },
]

function StepLevel({ value, onChange }: { value: CalisthenicsLevel | null; onChange: (v: CalisthenicsLevel) => void }) {
  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">Nivelul tău actual</h2>
      <p className="text-sm text-white/45 mb-6">Selectează cel mai apropiat nivel</p>
      <div className="flex flex-col gap-3">
        {LEVELS.map(l => (
          <button key={l.value} onClick={() => onChange(l.value)}
            className={`w-full text-left px-4 py-4 rounded-2xl transition-colors border ${
              value === l.value
                ? 'bg-brand-green border-brand-green'
                : 'border-white/12 bg-white/5 hover:bg-white/8'
            }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{l.emoji}</span>
              <div>
                <p className={`font-bold text-sm ${value === l.value ? 'text-black' : 'text-white'}`}>{l.label}</p>
                <p className={`text-xs ${value === l.value ? 'text-black/70' : 'text-white/45'}`}>{l.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step: Pushups ─────────────────────────────────────────────────────────────

const PUSHUP_TYPES: { value: PushupType; label: string; desc: string }[] = [
  { value: 'none',    label: 'Niciuna',           desc: 'Nu pot face flotări' },
  { value: 'knee',    label: 'Cu genunchii',       desc: 'Flotări modificate pe genunchi' },
  { value: 'regular', label: 'Flotări normale',   desc: 'Formă completă' },
]

function StepPushups({ type, count, onChange, onNext }: {
  type: PushupType; count: number
  onChange: (t: PushupType, c: number) => void
  onNext: () => void
}) {
  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">Flotări</h2>
      <p className="text-sm text-white/45 mb-6">Ce tip de flotări poți face?</p>
      <div className="flex flex-col gap-2.5 mb-6">
        {PUSHUP_TYPES.map(pt => (
          <button key={pt.value} onClick={() => onChange(pt.value, pt.value === 'none' ? 0 : count)}
            className={`w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
              type === pt.value ? 'bg-brand-green text-black' : 'text-white/80 border border-white/12 bg-white/5 hover:bg-white/8'
            }`}>
            {pt.label}
            <span className={`block text-xs font-normal mt-0.5 ${type === pt.value ? 'text-black/70' : 'text-white/40'}`}>{pt.desc}</span>
          </button>
        ))}
      </div>
      {type !== 'none' && (
        <div className="mb-6">
          <p className="text-sm text-white/60 mb-2">Câte repetări?</p>
          <RepCounter value={count} onChange={c => onChange(type, c)} />
        </div>
      )}
      <NextButton onClick={onNext} />
    </div>
  )
}

// ── Step: Pullups ─────────────────────────────────────────────────────────────

const PULLUP_TYPES: { value: PullupType; label: string; desc: string }[] = [
  { value: 'none',       label: 'Niciuna',                    desc: 'Nu pot face tracțiuni' },
  { value: 'australian', label: 'Australian Pull-Up',         desc: 'Tracțiuni înclinate la bară joasă' },
  { value: 'regular',    label: 'Tracțiuni complete',         desc: 'Bărbie deasupra barei' },
]

function StepPullups({ type, count, onChange, onNext }: {
  type: PullupType; count: number
  onChange: (t: PullupType, c: number) => void
  onNext: () => void
}) {
  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">Tracțiuni</h2>
      <p className="text-sm text-white/45 mb-6">Ce tip de tracțiuni poți face?</p>
      <div className="flex flex-col gap-2.5 mb-6">
        {PULLUP_TYPES.map(pt => (
          <button key={pt.value} onClick={() => onChange(pt.value, pt.value === 'none' ? 0 : count)}
            className={`w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
              type === pt.value ? 'bg-brand-green text-black' : 'text-white/80 border border-white/12 bg-white/5 hover:bg-white/8'
            }`}>
            {pt.label}
            <span className={`block text-xs font-normal mt-0.5 ${type === pt.value ? 'text-black/70' : 'text-white/40'}`}>{pt.desc}</span>
          </button>
        ))}
      </div>
      {type !== 'none' && (
        <div className="mb-6">
          <p className="text-sm text-white/60 mb-2">Câte repetări?</p>
          <RepCounter value={count} onChange={c => onChange(type, c)} />
        </div>
      )}
      <NextButton onClick={onNext} />
    </div>
  )
}

// ── Step: Squats ──────────────────────────────────────────────────────────────

function StepSquats({ count, onChange, onNext }: {
  count: number; onChange: (c: number) => void; onNext: () => void
}) {
  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">Genuflexiuni</h2>
      <p className="text-sm text-white/45 mb-6">Câte squaturi complete poți face consecutiv?</p>
      <div className="mb-6">
        <RepCounter value={count} onChange={onChange} max={500} />
      </div>
      <NextButton onClick={onNext} />
    </div>
  )
}

// ── Step: Cardio ──────────────────────────────────────────────────────────────

const CARDIO_OPTIONS: { value: CardioFrequency; label: string; desc: string }[] = [
  { value: 'never',   label: 'Niciodată',  desc: 'Nu fac cardio' },
  { value: 'rarely',  label: 'Rar',        desc: 'Câteva ori pe lună' },
  { value: 'regular', label: 'Regulat',    desc: 'De câteva ori pe săptămână' },
  { value: 'daily',   label: 'Zilnic',     desc: 'Cardio în fiecare zi' },
]

function StepCardio({ value, onChange }: { value: CardioFrequency | null; onChange: (v: CardioFrequency) => void }) {
  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">Cardio</h2>
      <p className="text-sm text-white/45 mb-6">Cât de des faci cardio?</p>
      <div className="flex flex-col gap-2.5">
        {CARDIO_OPTIONS.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
              value === o.value ? 'bg-brand-green text-black' : 'text-white/80 border border-white/12 bg-white/5 hover:bg-white/8'
            }`}>
            {o.label}
            <span className={`block text-xs font-normal mt-0.5 ${value === o.value ? 'text-black/70' : 'text-white/40'}`}>{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step: Skill Category ──────────────────────────────────────────────────────

function StepSkillCategory({ category, assignments, customInput, onCycleSkill, onCustomInputChange, onAddCustom, onNext }: {
  category: SkillCategoryDef
  assignments: SkillsByCategory
  customInput: string
  onCycleSkill: (skill: SkillItem) => void
  onCustomInputChange: (val: string) => void
  onAddCustom: () => void
  onNext: () => void
}) {
  const userCat = assignments[category.id] ?? { have: [], wantToLearn: [] }

  // Merge predefined + custom skills in this category
  const customSkills: SkillItem[] = [
    ...userCat.have.filter(s => s.id.startsWith('custom_')),
    ...userCat.wantToLearn.filter(s => s.id.startsWith('custom_')),
  ].filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)

  return (
    <div>
      <h2 className="text-xl font-black text-white mb-1">{category.name}</h2>
      <p className="text-sm text-white/45 mb-5">{category.question}</p>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-brand-green inline-block" />
          Stăpânesc
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          Vreau să învăț
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-white/20 inline-block" />
          Nu mă interesează
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {[...category.skills, ...customSkills].map(skill => {
          const zone = getSkillZone(assignments, category.id, skill.id)
          return (
            <button key={skill.id} onClick={() => onCycleSkill(skill)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                zone === 'HAVE'
                  ? 'bg-brand-green text-black'
                  : zone === 'WANT'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'bg-white/8 text-white/60 border border-white/12'
              }`}>
              {skill.name}
            </button>
          )
        })}
      </div>

      {/* Add custom skill */}
      <div className="flex gap-2 mb-6">
        <input
          value={customInput}
          onChange={e => onCustomInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAddCustom() }}
          placeholder="Adaugă skill personalizat..."
          className="flex-1 h-9 rounded-xl px-3 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
        />
        <button onClick={onAddCustom} disabled={!customInput.trim()}
          className="w-9 h-9 rounded-xl bg-brand-green/20 text-brand-green flex items-center justify-center disabled:opacity-40">
          <Plus size={16} />
        </button>
      </div>

      {/* Summary chips */}
      {userCat.have.length > 0 && (
        <p className="text-xs text-white/40 mb-4">
          ✅ {userCat.have.length} stăpânite · 🎯 {userCat.wantToLearn.length} de învățat
        </p>
      )}

      <NextButton onClick={onNext} />
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function NextButton({ onClick, label = 'Continuă' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick}
      className="w-full h-13 rounded-full font-bold text-black bg-brand-green flex items-center justify-center gap-2"
      style={{ height: 52 }}>
      <span>{label}</span>
      <ArrowRight size={16} />
    </button>
  )
}

function RepCounter({ value, onChange, max = 200 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={() => onChange(Math.max(0, value - 1))}
        className="w-11 h-11 rounded-2xl bg-white/10 text-white text-xl font-bold flex items-center justify-center">
        −
      </button>
      <input
        type="number" min={0} max={max}
        value={value}
        onChange={e => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className="flex-1 h-11 rounded-2xl text-center text-lg font-black text-white bg-white/8 border border-white/12 outline-none focus:border-brand-green/60"
      />
      <button onClick={() => onChange(Math.min(max, value + 1))}
        className="w-11 h-11 rounded-2xl bg-white/10 text-white text-xl font-bold flex items-center justify-center">
        +
      </button>
    </div>
  )
}
