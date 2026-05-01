'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/firestore'
import { collection, query, orderBy, limit, where, onSnapshot, doc } from 'firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import type { UserDoc, WorkoutDoc } from '@/types'
import { SKILLS, SKILL_LEVEL_LABELS, SKILL_LEVEL_COLORS } from '@/lib/skills'
import { Settings, Mail, Users, Pencil, LogOut, ChevronRight, Dumbbell, Flame } from 'lucide-react'

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

const COIN_TASKS = [
  { id: 'FIRST_WORKOUT', label: 'Primul antrenament', coins: 20, icon: '🏋️' },
  { id: 'COMPLETE_WORKOUT', label: 'Finalizează un antrenament', coins: 10, icon: '✅' },
  { id: 'STREAK_3', label: '3 zile consecutiv', coins: 15, icon: '🔥' },
  { id: 'STREAK_7', label: '7 zile consecutiv', coins: 50, icon: '🔥' },
  { id: 'STREAK_30', label: '30 zile consecutiv', coins: 200, icon: '🔥' },
  { id: 'COMPLETE_ASSESSMENT', label: 'Finalizează evaluarea', coins: 25, icon: '📋' },
  { id: 'JOIN_COMMUNITY', label: 'Alătură-te unei comunități', coins: 5, icon: '👥' },
  { id: 'ADD_FRIEND', label: 'Adaugă un prieten', coins: 5, icon: '🤝' },
  { id: 'WORKOUTS_10', label: '10 antrenamente totale', coins: 30, icon: '💪' },
  { id: 'WORKOUTS_50', label: '50 antrenamente totale', coins: 100, icon: '💪' },
  { id: 'WORKOUTS_100', label: '100 antrenamente totale', coins: 250, icon: '💪' },
  { id: 'SKILLS_5', label: '5 skill-uri deblocate', coins: 30, icon: '⭐' },
  { id: 'SKILLS_10', label: '10 skill-uri deblocate', coins: 75, icon: '🌟' },
]

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [showLogout, setShowLogout] = useState(false)
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutDoc[]>([])
  const [unlockedSkillIds, setUnlockedSkillIds] = useState<Set<string>>(new Set())
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())

  // Live profile
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) setProfile({ uid: snap.id, ...snap.data() } as UserDoc)
      setLoading(false)
    })
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

  // Unlocked skills
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(collection(db, 'users', user.uid, 'skills'), snap => {
      setUnlockedSkillIds(new Set(snap.docs.map(d => d.id)))
    })
    return unsub
  }, [user])

  // Completed coin tasks — query only this user's docs via uid field
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'coin_tasks'), where('uid', '==', user.uid)),
      snap => {
        const tasks = snap.docs.map(d => d.data().task as string)
        setCompletedTasks(new Set(tasks))
      }
    )
    return unsub
  }, [user])

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

  // Top unlocked skills preview
  const unlockedSkills = SKILLS.filter(s => unlockedSkillIds.has(s.id)).slice(0, 6)

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Logout dialog */}
      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--app-surface)' }}>
            <h2 className="text-lg font-bold text-white mb-2">Deconectare</h2>
            <p className="text-sm text-white/60 mb-6">Ești sigur că vrei să te deconectezi?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogout(false)}
                className="flex-1 h-11 rounded-xl border border-white/20 text-sm font-semibold text-white/80">
                Anulează
              </button>
              <button onClick={handleLogout}
                className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-bold">
                Deconectare
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
              <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: '#1ED75F33' }}>
                {photoUrl
                  ? <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
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
              <Stat value={String(profile?.totalWorkouts ?? 0)} label="Antrenamente" />
              <Stat value={String(profile?.coins ?? 0)} label="Monede" />
              <Stat value={String(profile?.friendCount ?? 0)} label="Prieteni" />
            </div>
            <div className="flex justify-end">
              <span className="px-3 py-1 rounded-full text-xs font-bold"
                style={{ backgroundColor: '#1ED75F22', color: '#1ED75F' }}>
                🔥 {profile?.currentStreak ?? 0} zile
              </span>
            </div>
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
              style={{
                backgroundColor: profile?.isCoach ? '#1ED75F22' : '#ffffff15',
                color: profile?.isCoach ? '#1ED75F' : 'rgba(255,255,255,0.7)',
              }}>
              {profile?.isCoach ? '⭐ Master Coach' : '⚔️ Începător'}
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
          {['Progres', 'Sarcini'].map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/45'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Progres tab ── */}
        {tab === 0 && (
          <div>
            {/* Recent workouts */}
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">Antrenamente recente</p>
                <Link href="/workout">
                  <span className="text-xs text-brand-green font-semibold">Vezi tot</span>
                </Link>
              </div>
              {recentWorkouts.length === 0 ? (
                <div className="text-center py-4">
                  <Dumbbell size={28} className="text-white/15 mx-auto mb-2" />
                  <p className="text-xs text-white/35">Niciun antrenament încă. Hai la muncă! 💪</p>
                  <Link href="/workout">
                    <button className="mt-3 h-8 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
                      Începe primul antrenament
                    </button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentWorkouts.map(w => (
                    <div key={w.id} className="flex items-center justify-between py-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {w.exercises.map(e => e.name).join(', ')}
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
                <p className="text-sm font-bold text-white">Skills</p>
                <Link href="/profile/skills">
                  <span className="text-xs text-brand-green font-semibold flex items-center gap-0.5">
                    {unlockedSkillIds.size}/{SKILLS.length} <ChevronRight size={12} />
                  </span>
                </Link>
              </div>

              {!profile?.assessmentCompleted ? (
                <div>
                  <p className="text-sm text-white/80 font-semibold mb-1">Descoperă nivelul tău!</p>
                  <p className="text-xs text-white/45 mb-3">Răspunde la câteva întrebări și personalizăm skill tree-ul.</p>
                  <Link href="/profile/assessment">
                    <button className="w-full h-10 rounded-xl bg-brand-green text-black font-bold text-sm">
                      Evaluează-te acum →
                    </button>
                  </Link>
                </div>
              ) : unlockedSkills.length === 0 ? (
                <p className="text-xs text-white/35 text-center py-2">
                  Niciun skill deblocat. <Link href="/profile/skills" className="text-brand-green">Deschide skill tree →</Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {unlockedSkills.map(s => (
                    <span key={s.id}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: `${SKILL_LEVEL_COLORS[s.level]}22`,
                        color: SKILL_LEVEL_COLORS[s.level],
                        border: `1px solid ${SKILL_LEVEL_COLORS[s.level]}44`,
                      }}>
                      {s.icon} {s.name}
                    </span>
                  ))}
                  {unlockedSkillIds.size > 6 && (
                    <Link href="/profile/skills">
                      <span className="h-7 px-2.5 rounded-full text-xs font-semibold bg-white/8 text-white/50 flex items-center">
                        +{unlockedSkillIds.size - 6} mai multe
                      </span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Logout */}
            <button onClick={() => setShowLogout(true)}
              className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-white bg-red-500/20 border border-red-500/30">
              <LogOut size={16} /> Deconectare
            </button>
          </div>
        )}

        {/* ── Sarcini tab ── */}
        {tab === 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-white/35 mb-2">Completează sarcini pentru a câștiga monede 🪙</p>
            {COIN_TASKS.map(task => {
              const done = completedTasks.has(task.id)
              return (
                <div key={task.id}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl ${done ? 'opacity-60' : ''}`}
                  style={{ backgroundColor: 'var(--app-surface)' }}>
                  <span className="text-xl flex-shrink-0">{task.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${done ? 'text-white/50 line-through' : 'text-white'}`}>
                      {task.label}
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
