'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, setDoc, updateDoc, serverTimestamp, collection, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { awardCoins } from '@/lib/coins'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'

// ── Assessment questions ──────────────────────────────────────────────────────

interface Question {
  id: string
  text: string
  subtext?: string
  options: { label: string; value: number }[]
  skillsToUnlock: { threshold: number; skillIds: string[] }[]
}

const QUESTIONS: Question[] = [
  {
    id: 'pushups',
    text: 'Câte flotări poți face consecutiv?',
    subtext: 'Formă completă, fără pauze',
    options: [
      { label: '0 – Nu pot face nicio flotare', value: 0 },
      { label: '1–5 flotări', value: 3 },
      { label: '6–15 flotări', value: 10 },
      { label: '16–30 flotări', value: 20 },
      { label: '30+ flotări', value: 35 },
    ],
    skillsToUnlock: [
      { threshold: 1, skillIds: ['knee_pushup'] },
      { threshold: 10, skillIds: ['pushup'] },
      { threshold: 20, skillIds: ['pushup', 'diamond_pushup'] },
    ],
  },
  {
    id: 'pullups',
    text: 'Câte tracțiuni poți face?',
    subtext: 'Bărbie deasupra barei, brațe complet extinse la bază',
    options: [
      { label: '0 – Nu pot face nicio tracțiune', value: 0 },
      { label: 'Pot atârna 30+ secunde', value: 1 },
      { label: '1–3 tracțiuni', value: 2 },
      { label: '4–8 tracțiuni', value: 6 },
      { label: '9–15 tracțiuni', value: 12 },
      { label: '15+ tracțiuni', value: 20 },
    ],
    skillsToUnlock: [
      { threshold: 1, skillIds: ['dead_hang'] },
      { threshold: 2, skillIds: ['dead_hang', 'australian_pullup'] },
      { threshold: 6, skillIds: ['dead_hang', 'australian_pullup', 'pullup'] },
      { threshold: 12, skillIds: ['pullup', 'chest_to_bar'] },
    ],
  },
  {
    id: 'dips',
    text: 'Poți executa dips pe bare paralele?',
    options: [
      { label: 'Nu, nu am forță suficientă', value: 0 },
      { label: 'Da, 1–5 dips', value: 3 },
      { label: 'Da, 6–15 dips', value: 10 },
      { label: 'Da, 15+ dips', value: 20 },
    ],
    skillsToUnlock: [
      { threshold: 3, skillIds: ['dip'] },
      { threshold: 10, skillIds: ['dip'] },
    ],
  },
  {
    id: 'squat',
    text: 'Câte squaturi complete poți face?',
    options: [
      { label: 'Sub 10', value: 5 },
      { label: '10–20', value: 15 },
      { label: '20–50', value: 35 },
      { label: '50+', value: 60 },
    ],
    skillsToUnlock: [
      { threshold: 15, skillIds: ['basic_squat'] },
      { threshold: 35, skillIds: ['basic_squat', 'pistol_squat'] },
    ],
  },
  {
    id: 'core',
    text: 'Core & statice — ce poți face?',
    options: [
      { label: 'Plank sub 30 secunde', value: 0 },
      { label: 'Plank 60+ secunde', value: 1 },
      { label: 'Hollow body hold 20+ sec', value: 2 },
      { label: 'L-sit 5+ secunde', value: 3 },
      { label: 'L-sit 10+ secunde', value: 4 },
    ],
    skillsToUnlock: [
      { threshold: 2, skillIds: ['hollow_body', 'arch_body'] },
      { threshold: 3, skillIds: ['hollow_body', 'arch_body', 'lsit'] },
      { threshold: 4, skillIds: ['hollow_body', 'arch_body', 'lsit'] },
    ],
  },
  {
    id: 'skills',
    text: 'Ai realizat vreuna din aceste mișcări avansate?',
    subtext: 'Selectează cel mai avansat nivel atins',
    options: [
      { label: 'Niciuna', value: 0 },
      { label: 'Handstand hold 5+ sec', value: 1 },
      { label: 'Muscle-up', value: 2 },
      { label: 'Front/Back Lever hold 3+ sec', value: 3 },
      { label: 'Planche sau One-arm pull-up', value: 4 },
    ],
    skillsToUnlock: [
      { threshold: 1, skillIds: ['handstand'] },
      { threshold: 2, skillIds: ['handstand', 'muscle_up'] },
      { threshold: 3, skillIds: ['handstand', 'muscle_up', 'tuck_front_lever', 'front_lever'] },
      { threshold: 4, skillIds: ['handstand', 'muscle_up', 'tuck_front_lever', 'front_lever', 'tuck_planche', 'one_arm_pullup'] },
    ],
  },
]

function computeLevel(answers: Record<string, number>): string {
  const total = Object.values(answers).reduce((sum, v) => sum + v, 0)
  if (total <= 5) return 'BEGINNER'
  if (total <= 20) return 'INTERMEDIATE'
  if (total <= 40) return 'ADVANCED'
  return 'ELITE'
}

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: '⚔️ Începător',
  INTERMEDIATE: '🔵 Intermediar',
  ADVANCED: '🟣 Avansat',
  ELITE: '🏆 Elite',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssessmentPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skillsUnlocked, setSkillsUnlocked] = useState<string[]>([])
  const [coinsEarned, setCoinsEarned] = useState(0)

  const question = QUESTIONS[step]
  const selected = answers[question?.id]
  const isLast = step === QUESTIONS.length - 1

  function selectAnswer(value: number) {
    setAnswers(prev => ({ ...prev, [question.id]: value }))
  }

  async function finish() {
    if (!user || saving) return
    setSaving(true)

    // Collect skills to unlock from all answers
    const toUnlock = new Set<string>()
    for (const q of QUESTIONS) {
      const ans = answers[q.id] ?? 0
      for (const rule of q.skillsToUnlock) {
        if (ans >= rule.threshold) {
          rule.skillIds.forEach(id => toUnlock.add(id))
        }
      }
    }

    try {
      const batch = writeBatch(db)

      // Unlock skills
      for (const skillId of toUnlock) {
        batch.set(doc(db, 'users', user.uid, 'skills', skillId), {
          skillId,
          unlockedAt: serverTimestamp(),
        })
      }

      // Mark assessment complete
      batch.update(doc(db, 'users', user.uid), {
        assessmentCompleted: true,
      })

      await batch.commit()

      const coins = await awardCoins(user.uid, 'COMPLETE_ASSESSMENT')
      setSkillsUnlocked([...toUnlock])
      setCoinsEarned(coins)
      setDone(true)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    const level = computeLevel(answers)
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mx-auto mb-4">
            <Check size={40} className="text-black" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-black text-white mb-1">Evaluare completă!</h2>
          <p className="text-white/50 text-sm">Nivelul tău curent</p>
          <p className="text-xl font-black text-brand-green mt-2">{LEVEL_LABELS[level]}</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-xs font-bold text-white/40 tracking-widest mb-3">SKILL-URI DEBLOCATE ({skillsUnlocked.length})</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {skillsUnlocked.slice(0, 12).map(id => (
              <span key={id} className="h-7 px-3 rounded-full text-xs font-semibold bg-brand-green/20 text-brand-green border border-brand-green/30">
                {id.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          {coinsEarned > 0 && (
            <p className="text-sm text-white/60">
              🪙 Ai câștigat <span className="text-brand-green font-bold">+{coinsEarned} monede</span> pentru evaluare!
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
            onClick={() => router.push('/profile/skills')}
            className="w-full h-12 rounded-full bg-brand-green text-black font-bold"
          >
            Vezi Skill Tree →
          </button>
          <button
            onClick={() => router.push('/profile')}
            className="w-full h-12 rounded-full border border-white/20 text-white/70 font-semibold text-sm"
          >
            Înapoi la profil
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-white/40 mb-1">
              <span>Întrebarea {step + 1} din {QUESTIONS.length}</span>
              <span>{Math.round(((step) / QUESTIONS.length) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-green transition-all"
                style={{ width: `${((step) / QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="mb-8">
          <h2 className="text-xl font-black text-white mb-1">{question.text}</h2>
          {question.subtext && <p className="text-sm text-white/45">{question.subtext}</p>}
        </div>

        {/* Options */}
        <div className="flex flex-col gap-2.5 mb-8">
          {question.options.map(opt => (
            <button
              key={opt.value}
              onClick={() => selectAnswer(opt.value)}
              className={`w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
                selected === opt.value
                  ? 'bg-brand-green text-black'
                  : 'text-white/80 border border-white/12 bg-white/5 hover:bg-white/8'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Next / Finish */}
        <button
          disabled={selected === undefined || saving}
          onClick={() => {
            if (isLast) finish()
            else setStep(s => s + 1)
          }}
          className="w-full h-13 rounded-full font-bold text-black bg-brand-green disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ height: 52 }}
        >
          {saving
            ? <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            : isLast
              ? 'Finalizează evaluarea ✓'
              : <><span>Continuă</span><ArrowRight size={16} /></>}
        </button>
      </div>
    </div>
  )
}
