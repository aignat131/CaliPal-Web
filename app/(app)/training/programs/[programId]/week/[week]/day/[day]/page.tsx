'use client'

import { use } from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, Clock, Info } from 'lucide-react'
import { getProgramById } from '@/lib/data/training-programs'

export default function TrainingDayPage({
  params,
}: {
  params: Promise<{ programId: string; week: string; day: string }>
}) {
  const { programId, week, day } = use(params)
  const router = useRouter()

  const program = getProgramById(programId)
  if (!program) notFound()

  const weekNum  = parseInt(week, 10)
  const dayNum   = parseInt(day, 10)
  const weekData = program.weeks.find(w => w.weekNumber === weekNum)
  if (!weekData) notFound()

  const dayData = weekData.days[dayNum - 1]
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
            <div key={i} className="rounded-xl p-3.5 border border-white/8"
              style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black"
                    style={{ backgroundColor: '#1ED75F15', color: '#1ED75F' }}>
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{ex.name}</p>
                    <p className="text-xs text-white/45 mt-0.5">
                      {ex.sets} × {ex.repsPerSet} {ex.metric === 'seconds' ? 'sec' : 'rep'}
                    </p>
                  </div>
                </div>
              </div>
              {ex.notes && (
                <div className="flex items-start gap-1.5 mt-2 pl-9">
                  <Info size={11} className="text-brand-green flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/45 leading-snug">{ex.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={startTraining}
          className="w-full h-14 rounded-2xl font-black text-black flex items-center justify-center gap-3 text-base"
          style={{ backgroundColor: '#1ED75F' }}
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
