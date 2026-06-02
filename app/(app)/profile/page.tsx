'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'
import { collection, query, orderBy, limit, where, onSnapshot, doc } from 'firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { UserDoc, WorkoutDoc } from '@/types'
import { Settings, Mail, Users, Pencil, LogOut, ChevronRight, Dumbbell, CheckCircle } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function formatDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date()
  return d.toLocaleDateString('ro', { day: '2-digit', month: 'short' })
}

function exercisePreview(ex: import('@/types').WorkoutExercise): string {
  const n = ex.sets.length
  if (n === 0) return ex.name
  const first = ex.sets[0]
  if (n === 1) {
    const v = first.reps != null ? `×${first.reps}` : first.durationSeconds != null ? `${first.durationSeconds}s` : ''
    return v ? `${ex.name} ${v}` : ex.name
  }
  const allSame = ex.sets.every(s => s.reps === first.reps && s.durationSeconds === first.durationSeconds)
  if (allSame) {
    const v = first.reps != null ? `${n}×${first.reps}` : first.durationSeconds != null ? `${n}×${first.durationSeconds}s` : `${n} serii`
    return `${ex.name} ${v}`
  }
  const total = ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
  return total > 0 ? `${ex.name} ${total} rep` : ex.name
}

const COIN_TASK_KEYS: Record<string, string> = {
  FIRST_WORKOUT:        'profile.task_first_workout',
  COMPLETE_WORKOUT:     'profile.task_complete_workout',
  STREAK_3:             'profile.task_streak_3',
  STREAK_7:             'profile.task_streak_7',
  STREAK_30:            'profile.task_streak_30',
  COMPLETE_ASSESSMENT:  'profile.task_complete_assessment',
  JOIN_COMMUNITY:       'profile.task_join_community',
  ADD_FRIEND:           'profile.task_add_friend',
  WORKOUTS_10:          'profile.task_workouts_10',
  WORKOUTS_50:          'profile.task_workouts_50',
  WORKOUTS_100:         'profile.task_workouts_100',
  SKILLS_5:             'profile.task_skills_5',
  SKILLS_10:            'profile.task_skills_10',
}

const COIN_TASKS = [
  { id: 'FIRST_WORKOUT',        coins: 20,  icon: '🏋️' },
  { id: 'COMPLETE_WORKOUT',     coins: 10,  icon: '✅' },
  { id: 'STREAK_3',             coins: 15,  icon: '🔥' },
  { id: 'STREAK_7',             coins: 50,  icon: '🔥' },
  { id: 'STREAK_30',            coins: 200, icon: '🔥' },
  { id: 'COMPLETE_ASSESSMENT',  coins: 25,  icon: '📋' },
  { id: 'JOIN_COMMUNITY',       coins: 5,   icon: '👥' },
  { id: 'ADD_FRIEND',           coins: 5,   icon: '🤝' },
  { id: 'WORKOUTS_10',          coins: 30,  icon: '💪' },
  { id: 'WORKOUTS_50',          coins: 100, icon: '💪' },
  { id: 'WORKOUTS_100',         coins: 250, icon: '💪' },
  { id: 'SKILLS_5',             coins: 30,  icon: '⭐' },
  { id: 'SKILLS_10',            coins: 75,  icon: '🌟' },
]

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useT()
  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [showLogout, setShowLogout] = useState(false)
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutDoc[]>([])
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())
  const [taskDoneToast, setTaskDoneToast] = useState<{ id: string; icon: string } | null>(null)
  const prevCompletedRef = useRef<Set<string>>(new Set())
  const prevDerivedRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const coinTasksReadyRef = useRef(false)

  // Live profile
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      snap => {
        if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() } as UserDoc)
        setLoading(false)
      },
      err => {
        console.error('Profile snapshot error', err)
        setLoading(false)
      }
    )
    return unsub
  }, [user])

  // Recent workouts
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'workouts'),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    const unsub = onSnapshot(q, snap => {
      setRecentWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as WorkoutDoc))
    })
    return unsub
  }, [user])

  // Completed coin tasks — query only this user's docs via uid field
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'coin_tasks'), where('uid', '==', user.uid)),
      snap => {
        coinTasksReadyRef.current = true
        const tasks = snap.docs.map(d => d.data().task as string)
        setCompletedTasks(new Set(tasks))
      }
    )
    return unsub
  }, [user])

  // Derived completion for tasks not guarded by coin_tasks docs
  function getDerivedCompleted(): Set<string> {
    const s = new Set<string>()
    if ((profile?.totalWorkouts ?? 0) > 0) s.add('COMPLETE_WORKOUT')
    if ((profile?.joinedCommunityIds?.length ?? 0) > 0) s.add('JOIN_COMMUNITY')
    if ((profile?.friendCount ?? 0) > 0) s.add('ADD_FRIEND')
    return s
  }

  // Show toast when a task is newly completed (skip initial load)
  useEffect(() => {
    if (!profile) return
    if (!coinTasksReadyRef.current) return
    const derived = getDerivedCompleted()
    if (!initializedRef.current) {
      // First data load — seed the refs so we only toast on changes after page open
      prevCompletedRef.current = new Set(completedTasks)
      prevDerivedRef.current = derived
      initializedRef.current = true
      return
    }
    for (const task of COIN_TASKS) {
      const wasDone = prevCompletedRef.current.has(task.id) || prevDerivedRef.current.has(task.id)
      const nowDone = completedTasks.has(task.id) || derived.has(task.id)
      if (nowDone && !wasDone) {
        setTaskDoneToast({ id: task.id, icon: task.icon })
        setTimeout(() => setTaskDoneToast(null), 3500)
        break
      }
    }
    prevCompletedRef.current = new Set(completedTasks)
    prevDerivedRef.current = derived
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedTasks, profile?.totalWorkouts, profile?.joinedCommunityIds, profile?.friendCount])

  async function handleLogout() {
    await signOut(auth)
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const storedName = profile?.displayName
  const displayName = (storedName && storedName !== 'Utilizator')
    ? storedName
    : (user?.displayName || storedName || 'Utilizator')
  const email = profile?.email ?? user?.email ?? ''
  const photoUrl = profile?.photoUrl ?? user?.photoURL ?? ''
  const initial = displayName.charAt(0).toUpperCase()

  // Skills from assessment (skillsByCategory.*.have)
  const allMasteredSkills = Object.values(profile?.skillsByCategory ?? {}).flatMap(cat => cat.have)
  const totalMastered = allMasteredSkills.length
  const totalAssessmentSkills = Object.values(profile?.skillsByCategory ?? {}).flatMap(cat => [
    ...cat.have, ...cat.wantToLearn, ...(cat.close ?? [])
  ]).length || 29 // fallback to 29 if no assessment data

  // Favorite skills: use favoriteSkillIds if set, else first 5 mastered
  const favoriteSkillIds = profile?.favoriteSkillIds ?? []
  const displaySkills = favoriteSkillIds.length > 0
    ? allMasteredSkills.filter(s => favoriteSkillIds.includes(s.id)).slice(0, 5)
    : allMasteredSkills.slice(0, 5)

  // Badge based on assessment level
  const assessmentLevel = profile?.basicStrength?.level
  const LEVEL_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    beginner:     { label: t('profile.badge_beginner'),     color: 'rgba(255,255,255,0.7)', bg: '#ffffff15' },
    intermediate: { label: t('profile.badge_intermediate'), color: '#60A5FA',               bg: '#3B82F622' },
    advanced:     { label: t('profile.badge_advanced'),     color: '#F97316',               bg: '#F9731622' },
    elite:        { label: t('profile.badge_elite'),        color: '#FFB800',               bg: '#FFB80022' },
  }
  const badge = profile?.isCoach
    ? { label: '⭐ Master Coach', color: '#1ED75F', bg: '#1ED75F22' }
    : LEVEL_BADGE[assessmentLevel ?? 'beginner'] ?? LEVEL_BADGE.beginner

  const tabs = [t('profile.tab_progress'), t('profile.tab_tasks')]

  const derivedCompleted = getDerivedCompleted()

  function isTaskDone(taskId: string): boolean {
    return completedTasks.has(taskId) || derivedCompleted.has(taskId)
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Task done toast */}
      {taskDoneToast && (
        <div
          className="fixed top-4 left-1/2 z-[600] flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg"
          style={{
            transform: 'translateX(-50%)',
            backgroundColor: '#1ED75F',
            animation: 'slideDown 0.35s ease',
          }}
        >
          <CheckCircle size={18} className="text-black flex-shrink-0" />
          <span className="text-sm font-black text-black">
            {t(COIN_TASK_KEYS[taskDoneToast.id] ?? taskDoneToast.id)} {taskDoneToast.icon}
          </span>
          <span className="text-xs font-bold text-black/60 ml-1">
            🪙 +{COIN_TASKS.find(c => c.id === taskDoneToast.id)?.coins ?? 0}
          </span>
        </div>
      )}
      {/* Logout dialog */}
      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <h2 className="text-lg font-bold text-white mb-2">{t('common.logout_title')}</h2>
            <p className="text-sm text-white/60 mb-6">{t('common.logout_text')}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm font-semibold text-white/80">
                {t('common.cancel')}
              </button>
              <button onClick={handleLogout}
                className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-bold">
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-5 pb-6">
        {/* Top action bar */}
        <div className="flex justify-end gap-2 mb-4">
          <Link href="/chat">
            <button className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
              <Mail size={16} className="text-white/70" />
            </button>
          </Link>
          <Link href="/profile/friends">
            <button className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
              <Users size={16} className="text-white/70" />
            </button>
          </Link>
          <Link href="/profile/settings">
            <button className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
              <Settings size={16} className="text-white/70" />
            </button>
          </Link>
        </div>

        {/* Profile header */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <Link href="/profile/edit">
              <div className="relative w-20 h-20 rounded-full overflow-hidden flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: '#1ED75F33' }}>
                {photoUrl
                  ? <Image src={photoUrl} alt={displayName} fill sizes="80px" className="object-cover" />
                  : <span className="text-3xl font-black text-brand-green">{initial}</span>}
              </div>
            </Link>
            <Link href="/profile/edit">
              <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-brand-green flex items-center justify-center cursor-pointer">
                <Pencil size={11} className="text-black" />
              </div>
            </Link>
          </div>

          <div className="flex-1">
            <div className="flex justify-around mb-2">
              <Link href="/workout"><Stat value={String(profile?.totalWorkouts ?? 0)} label={t('profile.workouts')} /></Link>
              <Stat value={String(profile?.coins ?? 0)} label={t('profile.coins')} />
              <Link href="/profile/friends"><Stat value={String(profile?.friendCount ?? 0)} label={t('profile.friends')} /></Link>
            </div>
            {(profile?.currentStreak ?? 0) > 0 && (
              <div className="flex justify-end">
                <span className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: '#1ED75F22', color: '#1ED75F' }}>
                  🔥 {t('profile.days_streak', { n: profile?.currentStreak ?? 0 })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Name + badge */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {!profile && !user?.displayName
              ? <div className="h-6 w-28 rounded-lg bg-white/8 animate-pulse" />
              : <span className="text-[17px] font-black text-white">{displayName}</span>
            }
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium"
              style={{ backgroundColor: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
            {user?.email === (process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? '') && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                style={{ backgroundColor: '#FFB80022', color: '#FFB800', border: '1px solid #FFB80040' }}>
                👑 Super Admin
              </span>
            )}
          </div>
          <p className="text-sm text-white/50">{email}</p>
          {profile?.bio && <p className="text-sm text-white/80 mt-1 leading-relaxed">{profile.bio}</p>}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-4">
          {tabs.map((label, i) => (
            <button key={label} onClick={() => setTab(i)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Progress tab ── */}
        {tab === 0 && (
          <div>
            {/* Recent workouts */}
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">{t('profile.recent_workouts')}</p>
                <Link href="/workout">
                  <span className="text-xs text-brand-green font-semibold">{t('common.see_all_short')}</span>
                </Link>
              </div>
              {recentWorkouts.length === 0 ? (
                <div className="text-center py-4">
                  <Dumbbell size={28} className="text-white/15 mx-auto mb-2" />
                  <p className="text-xs text-white/35">{t('profile.no_workouts')}</p>
                  <Link href="/workout">
                    <button className="mt-3 h-8 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
                      {t('profile.start_first')}
                    </button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentWorkouts.map(w => (
                    <div key={w.id} className="flex items-center justify-between py-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {w.exercises.map(e => exercisePreview(e)).join(' · ')}
                        </p>
                        <p className="text-[10px] text-white/35 mt-0.5">
                          ⏱ {formatDuration(w.durationSeconds)} · 🔁 {w.totalReps} rep
                        </p>
                      </div>
                      <span className="text-[10px] text-white/35 ml-3 flex-shrink-0">{formatDate(w.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills preview */}
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">{t('profile.skills')}</p>
                <Link href="/profile/skills">
                  <span className="text-xs text-brand-green font-semibold flex items-center gap-0.5">
                    {totalMastered}/{totalAssessmentSkills} <ChevronRight size={12} />
                  </span>
                </Link>
              </div>

              {!profile?.assessmentCompleted ? (
                <div>
                  <p className="text-sm text-white/80 font-semibold mb-1">{t('profile.assess_discover')}</p>
                  <p className="text-xs text-white/45 mb-3">{t('profile.assess_text')}</p>
                  <Link href="/profile/assessment">
                    <button className="w-full h-10 rounded-xl bg-brand-green text-black font-bold text-sm">
                      {t('profile.assess_cta')}
                    </button>
                  </Link>
                </div>
              ) : displaySkills.length === 0 ? (
                <p className="text-xs text-white/35 text-center py-2">
                  {t('profile.no_skills')} <Link href="/profile/skills" className="text-brand-green">{t('profile.open_skills')}</Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {displaySkills.map(s => (
                    <span key={s.id}
                      className="flex items-center h-7 px-2.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: '#1ED75F22', color: '#1ED75F', border: '1px solid #1ED75F44' }}>
                      {s.name}
                    </span>
                  ))}
                  {totalMastered > 5 && (
                    <Link href="/profile/skills">
                      <span className="h-7 px-2.5 rounded-full text-xs font-semibold bg-white/8 text-white/50 flex items-center">
                        {t('profile.more_skills', { n: totalMastered - 5 })}
                      </span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Logout */}
            <button onClick={() => setShowLogout(true)}
              className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-white bg-red-500/20 border border-red-500/30">
              <LogOut size={16} /> {t('common.logout')}
            </button>
          </div>
        )}

        {/* ── Tasks tab ── */}
        {tab === 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-white/35 mb-2">{t('profile.tasks_desc')}</p>
            {COIN_TASKS.map(task => {
              const done = isTaskDone(task.id)
              return (
                <div key={task.id}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl ${done ? 'opacity-60' : ''}`}
                  style={{ backgroundColor: 'var(--app-surface)' }}>
                  <span className="text-xl flex-shrink-0">{task.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${done ? 'text-white/50 line-through' : 'text-white'}`}>
                      {t(COIN_TASK_KEYS[task.id])}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-xs font-bold ${done ? 'text-white/30' : 'text-brand-green'}`}>
                      🪙 +{task.coins}
                    </span>
                    {done && (
                      <div className="w-5 h-5 rounded-full bg-brand-green/20 flex items-center justify-center">
                        <span className="text-brand-green text-[10px]">✓</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[17px] font-black text-white">{value}</span>
      <span className="text-[10px] text-white/45">{label}</span>
    </div>
  )
}
