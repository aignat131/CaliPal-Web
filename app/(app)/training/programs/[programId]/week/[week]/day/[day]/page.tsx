'use client'

import { use, useEffect, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, Clock } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { getProgramById, type ProgramDay } from '@/lib/data/training-programs'
import type { FirestoreTrainingProgram } from '@/types'
import ExerciseCard from '@/components/exercise/ExerciseCard'

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

  const totalSets = dayData.exercises.reduce((s, e) => s + e.sets, 0)
  const estimatedMinutes = Math.round(totalSets * 2.5 + dayData.exercises.length * 1)

  function startTraining() {
    const payload = {
      name: dayData.dayLabel,
      exercises: dayData.exercises.map(e => ({
        name: e.name,
        sets: e.sets,
        repsPerSet: e.repsPerSet,
      })),
    }
    sessionStorage.setItem('calipal_load_training', JSON.stringify(payload))
    router.push('/workout')
  }

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
        </div>

        {/* Stats */}
        <div className="rounded-2xl p-4 mb-5 flex gap-6 border border-white/8"
          style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="text-center">
            <p className="text-xl font-black text-white">{dayData.exercises.length}</p>
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
          {dayData.exercises.map((ex, i) => (
            <ExerciseCard
              key={i}
              index={i + 1}
              name={ex.name}
              sets={ex.sets}
              repsPerSet={ex.repsPerSet}
              metric={ex.metric}
              notes={ex.notes}
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={startTraining}
          className="w-full h-14 rounded-2xl font-black text-black flex items-center justify-center gap-3 text-base"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Play size={20} className="fill-black" />
          Începe antrenamentul
        </button>
        <p className="text-[11px] text-white/30 text-center mt-2">
          Exercițiile se vor încărca automat în tracker
        </p>

      </div>
    </div>
  )
}
