'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Dumbbell } from 'lucide-react'
import { getProgramById, LEVEL_LABELS, type ProgramDay } from '@/lib/data/training-programs'

export default function ProgramDetailPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = use(params)
  const program = getProgramById(programId)
  if (!program) notFound()

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
              <p className="text-xs text-white/45">{program.durationWeeks} săptămâni · {program.weeks.reduce((s, w) => s + w.days.filter(d => !d.restDay).length, 0)} antrenamente</p>
            </div>
          </div>
          <p className="text-sm text-white/60 leading-relaxed">{program.description}</p>
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
  programId, weekNumber, dayIndex, day,
}: {
  programId: string
  weekNumber: number
  dayIndex: number
  day: ProgramDay
}) {
  const exerciseCount = day.exercises.length
  const totalSets = day.exercises.reduce((s, e) => s + e.sets, 0)

  return (
    <Link href={`/training/programs/${programId}/week/${weekNumber}/day/${dayIndex + 1}`}>
      <div className="rounded-xl p-3.5 flex items-center gap-3 border border-white/8 hover:border-brand-green/25 transition-colors"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.08)', border: '1px solid rgba(var(--accent-rgb), 0.15)' }}>
          <Dumbbell size={16} className="text-brand-green" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{day.dayLabel}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {exerciseCount} exerciții · {totalSets} serii
          </p>
        </div>
        <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
      </div>
    </Link>
  )
}
