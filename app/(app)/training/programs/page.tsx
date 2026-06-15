'use client'

import Link from 'next/link'
import { ArrowLeft, Clock, ChevronRight } from 'lucide-react'
import { ALL_PROGRAMS, LEVEL_LABELS, type TrainingProgram } from '@/lib/data/training-programs'

export default function ProgramsPage() {
  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/workout">
            <button className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--app-surface)' }}>
              <ArrowLeft size={18} className="text-white/70" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-black text-white">Programe de Antrenament</h1>
            <p className="text-xs text-white/45 mt-0.5">Planuri structurate pentru progres real</p>
          </div>
        </div>

        {/* Program cards */}
        <div className="flex flex-col gap-4">
          {ALL_PROGRAMS.map(program => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>

      </div>
    </div>
  )
}

function ProgramCard({ program }: { program: TrainingProgram }) {
  const totalDays = program.weeks.reduce((sum, w) => sum + w.days.filter(d => !d.restDay).length, 0)

  return (
    <Link href={`/training/programs/${program.id}`}>
      <div className="rounded-2xl overflow-hidden border border-white/8 transition-all hover:border-brand-green/30"
        style={{ backgroundColor: 'var(--app-surface)' }}>

        {/* Colored header strip */}
        <div className="h-1.5 w-full"
          style={{ background: program.level === 'beginner' ? 'var(--accent)' : program.level === 'intermediate' ? 'rgba(var(--accent-rgb), 0.7)' : '#8B5CF6' }} />

        <div className="p-4">
          {/* Top row */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{program.focusEmoji}</span>
              <div>
                <p className="font-black text-white text-[15px] leading-tight">{program.name}</p>
                <p className="text-[11px] text-white/40 mt-0.5">{LEVEL_LABELS[program.level]}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-white/25 flex-shrink-0 mt-1" />
          </div>

          {/* Description */}
          <p className="text-xs text-white/55 leading-relaxed mb-3 line-clamp-2">{program.description}</p>

          {/* Meta row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-white/35" />
              <span className="text-xs text-white/50">{program.durationWeeks} săptămâni</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/50">{totalDays} antrenamente</span>
            </div>
            <div className="ml-auto">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: program.level === 'beginner' ? 'rgba(var(--accent-rgb), 0.13)' : program.level === 'intermediate' ? 'rgba(var(--accent-rgb), 0.09)' : '#8B5CF620',
                  color: program.level === 'beginner' ? 'var(--accent)' : program.level === 'intermediate' ? 'rgba(var(--accent-rgb), 0.7)' : '#A78BFA',
                }}>
                {program.focusLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
