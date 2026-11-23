'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Play, Zap, BookOpen, ChevronRight, Camera, Clock, Sparkles, Swords, Trophy, Heart, Mic, MoreHorizontal, X } from 'lucide-react'
import type { WorkoutDoc, UserDoc } from '@/types'
import type { ExerciseType } from '@/lib/ml/form-coach'
import FirstTimeHint from '@/components/ui/FirstTimeHint'
import { useT } from '@/lib/context/LanguageContext'
import { PushUpIcon, PullUpIcon, SquatIcon } from '@/components/icons'
import { WorkoutHistory } from './WorkoutHistory'
import { getExerciseType } from '../_helpers'

const EXERCISE_ICONS: Record<string, React.ComponentType<{ width?: number; height?: number; className?: string }>> = {
  'Flotări': PushUpIcon,
  'Tracțiuni': PullUpIcon,
  'Squaturi': SquatIcon,
}

const DEFAULT_QUICK_EXERCISES: { name: string; emoji: string }[] = [
  { name: 'Flotări',    emoji: '💪' },
  { name: 'Tracțiuni',  emoji: '🦾' },
  { name: 'Squaturi',   emoji: '🦵' },
]

const EXERCISE_EMOJI: Record<string, string> = {
  'flotări': '💪', 'flotari': '💪', 'push-up': '💪', 'pushup': '💪', 'diamond': '💎', 'pike': '🔺',
  'tracțiuni': '🦾', 'tractiuni': '🦾', 'chin-up': '🦾', 'chinup': '🦾', 'australian': '🦾',
  'squaturi': '🦵', 'squat': '🦵',
}

function getEmojiForExercise(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, emoji] of Object.entries(EXERCISE_EMOJI)) {
    if (lower.includes(key)) return emoji
  }
  return '🔥'
}

type Sheet = 'camera' | 'more' | null

export function WorkoutHomeTab({
  tab,
  onTabChange,
  history,
  historyLoading,
  profile,
  onStartWorkout,
  onDeleteWorkout,
  onQuickExercise,
  onAutoCount,
  onSpidermanChallenge,
  onHoldTimer,
  onStretchTimer,
  onVoiceLog,
  isActive,
  onQuickRecord,
}: {
  tab: number
  onTabChange: (t: number) => void
  history: WorkoutDoc[]
  historyLoading: boolean
  profile: UserDoc | null
  onStartWorkout: () => void
  onDeleteWorkout: (id: string) => Promise<void>
  onQuickExercise: (name: string, type: ExerciseType) => void
  onAutoCount: () => void
  onSpidermanChallenge: () => void
  onHoldTimer: () => void
  onStretchTimer: () => void
  onVoiceLog: () => void
  isActive?: boolean
  onQuickRecord?: (name: string, type: ExerciseType) => void
}) {
  const t = useT()
  const [fabOpen, setFabOpen] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)

  // Close the sheet on Android/browser back press
  useEffect(() => {
    if (!sheet) return
    window.history.pushState({ modal: `workout-${sheet}` }, '')
    const handlePop = () => setSheet(null)
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [sheet])

  // Camera-countable favourites, else the defaults
  const cameraFavorites = (profile?.favoriteExercises ?? [])
    .filter(name => getExerciseType(name) !== null)
    .map(name => ({ name, emoji: getEmojiForExercise(name) }))
  const quickExercises = cameraFavorites.length > 0 ? cameraFavorites.slice(0, 4) : DEFAULT_QUICK_EXERCISES

  function pick(action: () => void) {
    setSheet(null)
    action()
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black text-white">{t('workout.title')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-4 tab-bar">
        {[t('workout.tab_home'), t('workout.tab_history')].map((label, i) => (
          <button key={i} onClick={() => onTabChange(i)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="flex flex-col gap-3">
          {/* Start workout */}
          <div className="relative">
            <button
              onClick={onStartWorkout}
              className="w-full h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg text-black"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Play size={22} className="text-black fill-black" />
              {t('workout.start')}
            </button>
            {history.length === 0 && (
              <FirstTimeHint storageKey="calipal_hint_first_workout">
                {t('hint.first_workout')}
              </FirstTimeHint>
            )}
          </div>

          {/* Log afterwards / count with the camera */}
          <div className="grid grid-cols-2 gap-3">
            <Tile icon={<Mic size={20} className="text-brand-green" />} title={t('workout.log_title')} sub={t('workout.log_sub')} onClick={onVoiceLog} />
            <Tile icon={<Camera size={20} className="text-brand-green" />} title={t('workout.camera_title')} sub={t('workout.camera_sub')} onClick={() => setSheet('camera')} />
          </div>

          {/* Everything else */}
          <button
            onClick={() => setSheet('more')}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-white/60 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--app-surface)' }}
          >
            <MoreHorizontal size={16} /> {t('workout.more')}
          </button>
        </div>
      )}

      {tab === 1 && (
        <WorkoutHistory
          history={history}
          loading={historyLoading}
          onDelete={onDeleteWorkout}
        />
      )}

      {/* Camera sheet */}
      {sheet === 'camera' && (
        <BottomSheet title={t('workout.camera_title')} onClose={() => setSheet(null)}>
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">{t('workout.camera_count_reps')}</p>
          <div className="flex gap-2 mb-4">
            {quickExercises.map(ex => {
              const exType = getExerciseType(ex.name)
              if (!exType) return null
              const IconComponent = EXERCISE_ICONS[ex.name]
              return (
                <button
                  key={ex.name}
                  onClick={() => pick(() => onQuickExercise(ex.name, exType))}
                  className="flex-1 rounded-2xl py-3 flex flex-col items-center gap-1 active:scale-[0.97] transition-transform bg-white/5"
                >
                  {IconComponent ? <IconComponent width={32} height={32} /> : <span className="text-2xl">{ex.emoji}</span>}
                  <span className="font-bold text-white text-xs">{ex.name}</span>
                </button>
              )
            })}
          </div>
          <SheetRow icon={<Sparkles size={18} className="text-indigo-400" />} title={t('workout.auto_count')} sub={t('workout.auto_count_sub')} onClick={() => pick(onAutoCount)} />
          <SheetRow icon={<Clock size={18} className="text-cyan-400" />} title={t('workout.holds')} sub={t('workout.holds_sub')} onClick={() => pick(onHoldTimer)} />
          <SheetRow icon={<Heart size={18} className="text-pink-400" />} title={t('workout.stretching')} sub={t('workout.stretching_sub')} onClick={() => pick(onStretchTimer)} />
        </BottomSheet>
      )}

      {/* More sheet */}
      {sheet === 'more' && (
        <BottomSheet title={t('workout.more')} onClose={() => setSheet(null)}>
          <SheetRow icon={<BookOpen size={18} className="text-blue-400" />} title={t('workout.programs')} sub={t('workout.programs_sub')} href="/training/programs" />
          <SheetRow icon={<Zap size={18} className="text-brand-green" />} title={t('workout.form_analysis')} sub={t('workout.form_analysis_sub')} href="/workout/form-check" />
          <SheetRow icon={<Swords size={18} className="text-red-400" />} title={t('battle.title')} sub={t('battle.create_sub')} href="/battle" />
          <SheetRow icon={<Trophy size={18} className="text-amber-400" />} title={t('event.title')} sub={t('event.subtitle')} href="/event" />
          <SheetRow icon={<Image src="/icons/marvel.png" alt="" width={20} height={20} />} title={t('spiderman.title')} sub={t('spiderman.subtitle')} onClick={() => pick(onSpidermanChallenge)} />
        </BottomSheet>
      )}

      {/* Floating record FAB when workout is active */}
      {isActive && onQuickRecord && (
        <>
          {/* Backdrop when FAB is open */}
          {fabOpen && (
            <div className="fixed inset-0 z-29" onClick={() => setFabOpen(false)} />
          )}
          <div className="fixed right-4 z-30 flex flex-col items-center gap-2"
            style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
            {/* Expandable exercise options */}
            {fabOpen && (
              <div className="flex flex-col gap-2 animate-fade-in-up">
                {DEFAULT_QUICK_EXERCISES.map(ex => {
                  const exType = getExerciseType(ex.name)
                  if (!exType) return null
                  return (
                    <button
                      key={ex.name}
                      onClick={() => { setFabOpen(false); onQuickRecord(ex.name, exType) }}
                      className="flex items-center gap-2 px-3 py-2 rounded-full shadow-lg active:scale-95 transition-transform whitespace-nowrap"
                      style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.12)' }}
                    >
                      <span className="text-sm">{ex.emoji}</span>
                      <span className="text-xs font-bold text-white">{ex.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <button
              onClick={() => setFabOpen(o => !o)}
              className="w-14 h-14 rounded-full bg-red-500 shadow-lg shadow-red-500/30 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Camera size={24} className="text-white" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl p-4 flex flex-col items-start gap-2 text-left active:scale-[0.98] transition-transform"
      style={{ backgroundColor: 'var(--app-surface)' }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.12)' }}>
        {icon}
      </div>
      <div>
        <p className="font-black text-white text-sm">{title}</p>
        <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{sub}</p>
      </div>
    </button>
  )
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[55] bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl px-5 pt-4 animate-slide-up"
        style={{ backgroundColor: 'var(--app-surface)', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-black text-white text-base">{title}</p>
          <button onClick={onClose} aria-label="Închide" className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X size={14} className="text-white/60" />
          </button>
        </div>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </div>
  )
}

function SheetRow({ icon, title, sub, onClick, href }: { icon: ReactNode; title: string; sub: string; onClick?: () => void; href?: string }) {
  const content = (
    <>
      <div className="w-10 h-10 rounded-xl bg-white/6 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm">{title}</p>
        <p className="text-[11px] text-white/40 mt-0.5 truncate">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
    </>
  )
  const cls = 'w-full rounded-2xl p-3 flex items-center gap-3 text-left bg-white/4 active:scale-[0.98] transition-transform'
  return href
    ? <Link href={href} className={cls}>{content}</Link>
    : <button onClick={onClick} className={cls}>{content}</button>
}
