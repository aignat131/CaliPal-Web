'use client'

import { use, useEffect, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, Clock, ArrowLeftRight, Check, RotateCcw } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { getProgramById, type ProgramDay, type ProgramExercise } from '@/lib/data/training-programs'
import { useProgramEnrollment } from '@/lib/hooks/useProgramEnrollment'
import ExerciseCard from '@/components/exercise/ExerciseCard'
import ExerciseSwapSheet from '@/components/program/ExerciseSwapSheet'
import type { FirestoreTrainingProgram } from '@/types'

export default function TrainingDayPage({
  params,
}: {
  params: Promise<{ programId: string; week: string; day: string }>
}) {
  const { programId, week, day } = use(params)
  const router = useRouter()
  const weekNum = parseInt(week, 10)
  const dayNum = parseInt(day, 10)

  // Try hardcoded first
  const hardcoded = getProgramById(programId)

  const [firestoreProgram, setFirestoreProgram] = useState<FirestoreTrainingProgram | null>(null)
  const [loading, setLoading] = useState(!hardcoded)
  const [notFoundState, setNotFoundState] = useState(false)
  const [swapIndex, setSwapIndex] = useState<number | null>(null)

  const { getEnrollment, updateSwap, removeSwap } = useProgramEnrollment()
  const enrollment = getEnrollment(programId)

  useEffect(() => {
    if (hardcoded) return
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

  const program = hardcoded ?? firestoreProgram

  if (loading || !program) {
    return (
      <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
          <div className="h-10 w-48 rounded-xl animate-pulse mb-5" style={{ backgroundColor: 'var(--app-surface)' }} />
          <div className="h-24 rounded-2xl animate-pulse mb-5" style={{ backgroundColor: 'var(--app-surface)' }} />
          <div className="h-20 rounded-2xl animate-pulse mb-2" style={{ backgroundColor: 'var(--app-surface)' }} />
          <div className="h-20 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
        </div>
      </div>
    )
  }

  const weekData = program.weeks.find(w => w.weekNumber === weekNum)
  if (!weekData) notFound()

  const dayData: ProgramDay = weekData.days[dayNum - 1]
  if (!dayData) notFound()

  // Apply exercise swaps from enrollment
  const effectiveExercises: ProgramExercise[] = dayData.exercises.map((ex, i) => {
    const swapKey = `w${weekNum}_d${dayNum}_e${i}`
    const swappedName = enrollment?.exerciseSwaps?.[swapKey]
    if (swappedName) {
      return { ...ex, name: swappedName, notes: `Înlocuiește: ${ex.name}` }
    }
    return ex
  })

  const totalSets = effectiveExercises.reduce((s, e) => s + e.sets, 0)
  const estimatedMinutes = Math.round(totalSets * 2.5 + effectiveExercises.length * 1)

  const dayKey = `w${weekNum}_d${dayNum}`
  const isDayCompleted = !!enrollment?.dayProgress[dayKey]
  const isEnrolled = enrollment?.status === 'active' || enrollment?.status === 'completed'
  const programSource = hardcoded ? 'hardcoded' as const : 'firestore' as const

  function startTraining() {
    const payload = {
      name: dayData.dayLabel,
      programId,
      week: weekNum,
      day: dayNum,
      programSource,
      exercises: effectiveExercises.map(e => ({
        name: e.name,
        sets: e.sets,
        repsPerSet: e.repsPerSet,
      })),
    }
    sessionStorage.setItem('calipal_load_training', JSON.stringify(payload))
    router.push('/workout')
  }

  function handleSwap(exerciseIndex: number, newName: string) {
    if (enrollment) {
      updateSwap(programId, weekNum, dayNum, exerciseIndex, newName)
    }
    setSwapIndex(null)
  }

  function handleResetSwap(exerciseIndex: number) {
    if (enrollment) {
      removeSwap(programId, weekNum, dayNum, exerciseIndex)
    }
    setSwapIndex(null)
  }

  const swapExercise = swapIndex !== null ? dayData.exercises[swapIndex] : null

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href={`/training/programs/${programId}`}>
            <button className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--app-surface)' }}>
              <ArrowLeft size={18} className="text-white/70" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/40">{weekData.weekLabel}</p>
            <h1 className="text-base font-black text-white leading-tight">{dayData.dayLabel}</h1>
          </div>
          {isDayCompleted && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-green/15 border border-brand-green/25">
              <Check size={12} className="text-brand-green" />
              <span className="text-[10px] font-bold text-brand-green">Completat</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="rounded-2xl p-4 mb-5 flex gap-6 border border-white/8"
          style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="text-center">
            <p className="text-xl font-black text-white">{effectiveExercises.length}</p>
            <p className="text-xs text-white/40">Exerciții</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-black text-white">{totalSets}</p>
            <p className="text-xs text-white/40">Serii</p>
          </div>
          <div className="text-center flex items-center gap-1">
            <Clock size={14} className="text-white/40" />
            <div>
              <p className="text-xl font-black text-white">~{estimatedMinutes}</p>
              <p className="text-xs text-white/40">min</p>
            </div>
          </div>
        </div>

        {/* Exercise list */}
        <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">EXERCIȚII</p>
        <div className="flex flex-col gap-2 mb-6">
          {effectiveExercises.map((ex, i) => {
            const isSwapped = !!enrollment?.exerciseSwaps?.[`w${weekNum}_d${dayNum}_e${i}`]
            return (
              <div key={i} className="relative">
                <ExerciseCard
                  index={i + 1}
                  name={ex.name}
                  sets={ex.sets}
                  repsPerSet={ex.repsPerSet}
                  metric={ex.metric}
                  notes={ex.notes}
                />
                {/* Swap button — only shown when enrolled */}
                {isEnrolled && (
                  <button
                    onClick={(e) => { e.preventDefault(); setSwapIndex(i) }}
                    className={`absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      isSwapped ? 'bg-brand-green/15 text-brand-green' : 'bg-white/5 text-white/25 hover:text-white/50'
                    }`}
                    title="Schimbă exercițiul"
                  >
                    <ArrowLeftRight size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <button
          onClick={startTraining}
          className="w-full h-14 rounded-2xl font-black text-black flex items-center justify-center gap-3 text-base"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {isDayCompleted ? (
            <>
              <RotateCcw size={20} />
              Refă antrenamentul
            </>
          ) : (
            <>
              <Play size={20} className="fill-black" />
              Începe antrenamentul
            </>
          )}
        </button>
        <p className="text-[11px] text-white/30 text-center mt-2">
          Exercițiile se vor încărca automat în tracker
        </p>

      </div>

      {/* Exercise Swap Sheet */}
      {swapIndex !== null && swapExercise && (
        <ExerciseSwapSheet
          open
          onClose={() => setSwapIndex(null)}
          exerciseName={swapExercise.name}
          currentName={effectiveExercises[swapIndex].name}
          onSwap={(newName) => handleSwap(swapIndex, newName)}
          onReset={() => handleResetSwap(swapIndex)}
          isSwapped={effectiveExercises[swapIndex].name !== swapExercise.name}
        />
      )}
    </div>
  )
}
