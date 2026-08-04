'use client'

import { use, useEffect, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Dumbbell, Check, RotateCcw, X } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { getProgramById, LEVEL_LABELS, type TrainingProgram, type ProgramDay } from '@/lib/data/training-programs'
import { useProgramEnrollment } from '@/lib/hooks/useProgramEnrollment'
import type { FirestoreTrainingProgram, ProgramEnrollment } from '@/types'

export default function ProgramDetailPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = use(params)
  const router = useRouter()

  // Try hardcoded first (instant)
  const hardcoded = getProgramById(programId)

  const [firestoreProgram, setFirestoreProgram] = useState<FirestoreTrainingProgram | null>(null)
  const [loading, setLoading] = useState(!hardcoded)
  const [notFoundState, setNotFoundState] = useState(false)

  const {
    activeEnrollment, getEnrollment, enroll, abandon, restartProgram, loading: enrollLoading,
  } = useProgramEnrollment()

  useEffect(() => {
    if (hardcoded) return // no need to fetch
    getDoc(doc(db, 'training_programs', programId)).then(snap => {
      if (snap.exists()) {
        setFirestoreProgram({ id: snap.id, ...snap.data() } as FirestoreTrainingProgram)
      } else {
        setNotFoundState(true)
      }
      setLoading(false)
    }).catch(() => {
      setNotFoundState(true)
      setLoading(false)
    })
  }, [programId, hardcoded])

  if (notFoundState) notFound()

  // Use hardcoded or firestore program
  const program: TrainingProgram | FirestoreTrainingProgram | null = hardcoded ?? firestoreProgram

  if (loading || !program) {
    return (
      <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
          <div className="h-10 w-48 rounded-xl animate-pulse mb-5" style={{ backgroundColor: 'var(--app-surface)' }} />
          <div className="h-32 rounded-2xl animate-pulse mb-5" style={{ backgroundColor: 'var(--app-surface)' }} />
          <div className="h-16 rounded-xl animate-pulse mb-2" style={{ backgroundColor: 'var(--app-surface)' }} />
          <div className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
        </div>
      </div>
    )
  }

  const enrollment = getEnrollment(programId)
  const isEnrolledHere = enrollment?.status === 'active'
  const isEnrolledElsewhere = !isEnrolledHere && activeEnrollment !== null
  const isCompleted = enrollment?.status === 'completed'
  const totalDays = program.weeks.reduce((s, w) => s + w.days.filter(d => !d.restDay).length, 0)
  const programSource = hardcoded ? 'hardcoded' as const : 'firestore' as const

  async function handleEnroll() {
    await enroll(programId, programSource, program!.name, program!.weeks.length, totalDays)
  }

  async function handleAbandon() {
    if (!confirm('Ești sigur că vrei să abandonezi acest program?')) return
    await abandon(programId)
  }

  async function handleRestart() {
    await restartProgram(programId)
  }

  function goToNextDay() {
    if (!enrollment) return
    router.push(`/training/programs/${programId}/week/${enrollment.currentWeek}/day/${enrollment.currentDay}`)
  }

  const progressPct = enrollment ? Math.round((enrollment.completedDays / enrollment.totalDays) * 100) : 0

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/training/programs">
            <button className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--app-surface)' }}>
              <ArrowLeft size={18} className="text-white/70" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white leading-tight truncate">{program.name}</h1>
            <p className="text-xs text-white/45">{LEVEL_LABELS[program.level]}</p>
          </div>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl p-5 mb-5 border border-white/8"
          style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{program.focusEmoji}</span>
            <div>
              <p className="font-black text-white">{program.name}</p>
              <p className="text-xs text-white/45">{program.durationWeeks} săptămâni · {totalDays} antrenamente</p>
            </div>
          </div>
          <p className="text-sm text-white/60 leading-relaxed">{program.description}</p>

          {/* Progress bar */}
          {enrollment && enrollment.completedDays > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-white/45">
                  {enrollment.completedDays}/{enrollment.totalDays} zile
                </span>
                <span className="text-[11px] font-bold text-brand-green">{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, backgroundColor: 'var(--accent)' }}
                />
              </div>
            </div>
          )}

          {/* Enrollment CTA */}
          {!enrollLoading && (
            <div className="mt-4 flex flex-col gap-2">
              {isEnrolledHere && !isCompleted && (
                <>
                  <button onClick={goToNextDay}
                    className="w-full h-12 rounded-2xl font-black text-black flex items-center justify-center gap-2 text-sm"
                    style={{ backgroundColor: 'var(--accent)' }}>
                    Continuă — Săpt. {enrollment!.currentWeek}, Ziua {enrollment!.currentDay}
                  </button>
                  <button onClick={handleAbandon}
                    className="w-full h-10 rounded-xl text-white/40 text-xs font-bold flex items-center justify-center gap-1.5 hover:text-red-400 transition-colors">
                    <X size={13} /> Abandonează
                  </button>
                </>
              )}
              {isCompleted && (
                <>
                  <div className="flex items-center justify-center gap-2 py-2">
                    <div className="w-7 h-7 rounded-full bg-brand-green flex items-center justify-center">
                      <Check size={16} className="text-black" />
                    </div>
                    <span className="text-sm font-black text-brand-green">Completat!</span>
                  </div>
                  <button onClick={handleRestart}
                    className="w-full h-10 rounded-xl border border-white/10 text-white/50 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-brand-green/30 hover:text-white/70 transition-colors">
                    <RotateCcw size={13} /> Reia programul
                  </button>
                </>
              )}
              {!isEnrolledHere && !isCompleted && !isEnrolledElsewhere && (
                <button onClick={handleEnroll}
                  className="w-full h-12 rounded-2xl font-black text-black flex items-center justify-center gap-2 text-sm"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  Înscrie-te în program
                </button>
              )}
              {isEnrolledElsewhere && (
                <div className="text-center py-2">
                  <p className="text-xs text-white/35">Înscris în alt program ({activeEnrollment!.programName})</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Weeks */}
        <div className="flex flex-col gap-4">
          {program.weeks.map(week => (
            <div key={week.weekNumber}>
              <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2 uppercase">
                {week.weekLabel}
              </p>
              <div className="flex flex-col gap-2">
                {week.days.map((day, dayIdx) => (
                  <DayCard
                    key={dayIdx}
                    programId={program.id}
                    weekNumber={week.weekNumber}
                    dayIndex={dayIdx}
                    day={day}
                    enrollment={enrollment}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

function DayCard({
  programId, weekNumber, dayIndex, day, enrollment,
}: {
  programId: string
  weekNumber: number
  dayIndex: number
  day: ProgramDay
  enrollment: ProgramEnrollment | null
}) {
  const exerciseCount = day.exercises.length
  const totalSets = day.exercises.reduce((s, e) => s + e.sets, 0)
  const dayKey = `w${weekNumber}_d${dayIndex + 1}`
  const isDone = !!enrollment?.dayProgress[dayKey]
  const isCurrent = enrollment?.status === 'active'
    && enrollment.currentWeek === weekNumber
    && enrollment.currentDay === dayIndex + 1

  return (
    <Link href={`/training/programs/${programId}/week/${weekNumber}/day/${dayIndex + 1}`}>
      <div className={`rounded-xl p-3.5 flex items-center gap-3 border transition-colors ${
        isCurrent ? 'border-brand-green/40' : isDone ? 'border-brand-green/15' : 'border-white/8 hover:border-brand-green/25'
      }`}
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isDone ? 'bg-brand-green' : ''
        }`}
          style={isDone ? undefined : {
            backgroundColor: 'rgba(var(--accent-rgb), 0.08)',
            border: isCurrent ? '2px solid var(--accent)' : '1px solid rgba(var(--accent-rgb), 0.15)',
          }}>
          {isDone ? (
            <Check size={18} className="text-black" />
          ) : isCurrent ? (
            <div className="w-2.5 h-2.5 rounded-full bg-brand-green animate-pulse" />
          ) : (
            <Dumbbell size={16} className="text-brand-green" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${isDone ? 'text-white/60' : 'text-white'}`}>{day.dayLabel}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {exerciseCount} exerciții · {totalSets} serii
          </p>
        </div>
        <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
      </div>
    </Link>
  )
}
