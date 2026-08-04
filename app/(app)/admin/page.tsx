'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { ArrowLeft, MapPin, Trophy, Users, BadgeCheck, Dumbbell, MessageSquare, Shield, BookOpen } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'

import { ParksTab } from './_components/ParksTab'
import { ChallengesTab } from './_components/ChallengesTab'
import { CommunitiesTab } from './_components/CommunitiesTab'
import { ParkCommunityRequestsTab } from './_components/ParkCommunityRequestsTab'
import { VerificationsTab } from './_components/VerificationsTab'
import { ExercisesTab } from './_components/ExercisesTab'
import { FeedbackTab } from './_components/FeedbackTab'
import { TrainingsBackupTab } from './_components/TrainingsBackupTab'
import { ProgramsTab } from './_components/ProgramsTab'

type AdminTab = 'parks' | 'challenges' | 'communities' | 'park_requests' | 'verifications' | 'exercises' | 'feedback' | 'trainings' | 'programs'

export default function AdminPage() {
  const { user, isSuperAdmin } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<AdminTab>('parks')
  const [resettingPoints, setResettingPoints] = useState(false)
  const [resetResult, setResetResult] = useState<string | null>(null)

  async function handleResetPoints() {
    if (resettingPoints) return
    setResettingPoints(true)
    setResetResult(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/reset-points', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.ok) {
        setResetResult(`${data.communitiesProcessed} comunități, ${data.membersUpdated} membri actualizați.`)
      } else {
        setResetResult(`Eroare: ${data.reason}`)
      }
    } catch {
      setResetResult('Eroare de rețea.')
    } finally {
      setResettingPoints(false)
    }
  }

  useEffect(() => {
    if (user && !isSuperAdmin) router.replace('/home')
  }, [user, isSuperAdmin, router])

  if (!user || !isSuperAdmin) return <div className="min-h-screen" style={{ backgroundColor: 'var(--app-bg)' }} />

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white">Admin Hub</h1>
            <p className="text-xs text-white/40">SuperAdmin: {user.email}</p>
          </div>
          <div className="ml-auto px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <Shield size={10} className="inline mr-1" />ADMIN
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/10 mb-5 pb-1">
          {([
            ['parks', 'Parcuri', <MapPin key="p" size={12} />],
            ['challenges', 'Provocări', <Trophy key="c" size={12} />],
            ['communities', 'Comunități', <Users key="u" size={12} />],
            ['park_requests', 'Cereri Parc', <MapPin key="pr" size={12} />],
            ['verifications', 'Verificări', <BadgeCheck key="v" size={12} />],
            ['exercises', 'Exerciții', <Dumbbell key="ex" size={12} />],
            ['feedback', 'Feedback', <MessageSquare key="fb" size={12} />],
            ['trainings', 'Antrenamente', <Shield key="tr" size={12} />],
            ['programs', 'Programe', <BookOpen key="pg" size={12} />],
          ] as [AdminTab, string, React.ReactNode][]).map(([t, label, icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`h-8 px-3 rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors ${
                tab === t ? 'bg-brand-green text-black' : 'bg-white/8 text-white/50'
              }`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mb-5">
          <button onClick={handleResetPoints} disabled={resettingPoints}
            className="h-8 px-3 rounded-xl text-[11px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 disabled:opacity-40">
            {resettingPoints ? 'Se resetează...' : 'Reset puncte antrenament'}
          </button>
          {resetResult && <span className="text-[11px] text-white/50">{resetResult}</span>}
        </div>

        {tab === 'parks' && <ParksTab />}
        {tab === 'challenges' && <ChallengesTab />}
        {tab === 'communities' && <CommunitiesTab />}
        {tab === 'park_requests' && <ParkCommunityRequestsTab />}
        {tab === 'verifications' && <VerificationsTab />}
        {tab === 'exercises' && <ExercisesTab />}
        {tab === 'feedback' && <FeedbackTab />}
        {tab === 'trainings' && <TrainingsBackupTab />}
        {tab === 'programs' && <ProgramsTab />}
      </div>
    </div>
  )
}
