'use client'

import Link from 'next/link'
import { ArrowLeft, Clock, ChevronRight, Check } from 'lucide-react'
import { ALL_PROGRAMS, LEVEL_LABELS, type TrainingProgram } from '@/lib/data/training-programs'
import { useFirestorePrograms } from '@/lib/hooks/useFirestorePrograms'
import { useProgramEnrollment } from '@/lib/hooks/useProgramEnrollment'
import type { FirestoreTrainingProgram, ProgramEnrollment } from '@/types'

export default function ProgramsPage() {
  const { programs: firestorePrograms, loading } = useFirestorePrograms()
  const { activeEnrollment, getEnrollment, loading: enrollLoading } = useProgramEnrollment()

  // Sort enrolled program to top within each section
  const sortedFirestore = [...firestorePrograms].sort((a, b) => {
    const aEnrolled = getEnrollment(a.id)?.status === 'active' ? -1 : 0
    const bEnrolled = getEnrollment(b.id)?.status === 'active' ? -1 : 0
    return aEnrolled - bEnrolled
  })

  const sortedHardcoded = [...ALL_PROGRAMS].sort((a, b) => {
    const aEnrolled = getEnrollment(a.id)?.status === 'active' ? -1 : 0
    const bEnrolled = getEnrollment(b.id)?.status === 'active' ? -1 : 0
    return aEnrolled - bEnrolled
  })

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

        {/* Firestore programs (custom) */}
        {loading ? (
          <div className="flex flex-col gap-3 mb-6">
            {[0, 1].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
            ))}
          </div>
        ) : sortedFirestore.length > 0 ? (
          <>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3 px-1">PROGRAME CUSTOM</p>
            <div className="flex flex-col gap-4 mb-6">
              {sortedFirestore.map(program => (
                <ProgramCardWrapper key={program.id} id={program.id} enrollment={enrollLoading ? null : getEnrollment(program.id)}>
                  <FirestoreProgramCard program={program} />
                </ProgramCardWrapper>
              ))}
            </div>
          </>
        ) : null}

        {/* Built-in programs */}
        <p className="text-[10px] font-bold text-white/35 tracking-widest mb-3 px-1">PROGRAME INTEGRATE</p>
        <div className="flex flex-col gap-4">
          {sortedHardcoded.map(program => (
            <ProgramCardWrapper key={program.id} id={program.id} enrollment={enrollLoading ? null : getEnrollment(program.id)}>
              <ProgramCard program={program} />
            </ProgramCardWrapper>
          ))}
        </div>

      </div>
    </div>
  )
}

function ProgramCardWrapper({ id, enrollment, children }: { id: string; enrollment: ProgramEnrollment | null; children: React.ReactNode }) {
  const isActive = enrollment?.status === 'active'
  const isCompleted = enrollment?.status === 'completed'
  const progressPct = enrollment && enrollment.totalDays > 0
    ? Math.round((enrollment.completedDays / enrollment.totalDays) * 100) : 0

  return (
    <div className="relative">
      {children}
      {/* Enrollment badge + progress overlay */}
      {(isActive || isCompleted) && (
        <div className="absolute top-0 right-0 mt-3 mr-4 flex items-center gap-1.5">
          {isActive && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/15 text-brand-green border border-brand-green/25">
              Înscris · {progressPct}%
            </span>
          )}
          {isCompleted && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/15 text-brand-green border border-brand-green/25 flex items-center gap-1">
              <Check size={10} /> Completat
            </span>
          )}
        </div>
      )}
      {/* Progress bar under card */}
      {isActive && enrollment.completedDays > 0 && (
        <div className="px-4 pb-3 -mt-1" style={{ position: 'relative', zIndex: 1 }}>
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${progressPct}%`, backgroundColor: 'var(--accent)' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function FirestoreProgramCard({ program }: { program: FirestoreTrainingProgram }) {
  const totalDays = program.weeks.reduce((sum, w) => sum + w.days.filter(d => !d.restDay).length, 0)

  return (
    <Link href={`/training/programs/${program.id}`}>
      <div className="rounded-2xl overflow-hidden border border-white/8 transition-all hover:border-brand-green/30"
        style={{ backgroundColor: 'var(--app-surface)' }}>

        <div className="h-1.5 w-full"
          style={{ background: program.level === 'beginner' ? 'var(--accent)' : program.level === 'intermediate' ? 'rgba(var(--accent-rgb), 0.7)' : '#8B5CF6' }} />

        <div className="p-4">
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

          <p className="text-xs text-white/55 leading-relaxed mb-3 line-clamp-2">{program.description}</p>

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

function ProgramCard({ program }: { program: TrainingProgram }) {
  const totalDays = program.weeks.reduce((sum, w) => sum + w.days.filter(d => !d.restDay).length, 0)

  return (
    <Link href={`/training/programs/${program.id}`}>
      <div className="rounded-2xl overflow-hidden border border-white/8 transition-all hover:border-brand-green/30"
        style={{ backgroundColor: 'var(--app-surface)' }}>

        <div className="h-1.5 w-full"
          style={{ background: program.level === 'beginner' ? 'var(--accent)' : program.level === 'intermediate' ? 'rgba(var(--accent-rgb), 0.7)' : '#8B5CF6' }} />

        <div className="p-4">
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

          <p className="text-xs text-white/55 leading-relaxed mb-3 line-clamp-2">{program.description}</p>

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
