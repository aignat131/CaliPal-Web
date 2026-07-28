'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, updateDoc, deleteDoc,
  doc, query, orderBy, where, getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { createNotification } from '@/lib/firebase/notifications'
import { useAuth } from '@/lib/hooks/useAuth'
import type { CommunityDoc } from '@/types'
import { Trash2, Dumbbell } from 'lucide-react'

export function CommunitiesTab() {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<CommunityDoc[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [members, setMembers] = useState<Record<string, { userId: string; displayName: string; role: string }[]>>({})
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)

  async function backfillPoints() {
    if (!confirm('Setezi trainingPoints = totalWorkouts × 10 pentru toți membrii cu 0 puncte?')) return
    setBackfilling(true)
    setBackfillResult(null)
    try {
      // Load all users to get totalWorkouts
      const usersSnap = await getDocs(collection(db, 'users'))
      const userWorkouts: Record<string, number> = {}
      for (const d of usersSnap.docs) {
        userWorkouts[d.id] = (d.data().totalWorkouts as number) ?? 0
      }

      const commSnap = await getDocs(collection(db, 'communities'))
      let updated = 0
      let skipped = 0

      for (const commDoc of commSnap.docs) {
        const membersSnap = await getDocs(collection(db, 'communities', commDoc.id, 'members'))
        for (const memberDoc of membersSnap.docs) {
          const uid = memberDoc.id
          const currentPoints = (memberDoc.data().trainingPoints as number) ?? 0
          if (currentPoints !== 0) { skipped++; continue }
          const totalWorkouts = userWorkouts[uid] ?? 0
          if (totalWorkouts === 0) { skipped++; continue }
          await updateDoc(doc(db, 'communities', commDoc.id, 'members', uid), {
            trainingPoints: totalWorkouts * 10,
          })
          updated++
        }
      }

      setBackfillResult(`Gata! Actualizat: ${updated}, Sărit: ${skipped}`)
    } catch (e) {
      setBackfillResult(`Eroare: ${(e as Error).message}`)
    } finally {
      setBackfilling(false)
    }
  }

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'communities'), orderBy('memberCount', 'desc')),
      snap => setCommunities(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityDoc))
    )
    return unsub
  }, [])

  async function deleteCommunity(c: CommunityDoc) {
    if (!confirm(`Ștergi comunitatea "${c.name}"? Creatorul va fi notificat.`)) return
    // Unlink from any park that has this community
    const parkSnap = await getDocs(query(collection(db, 'parks'), where('communityId', '==', c.id)))
    await Promise.all(parkSnap.docs.map(d => updateDoc(doc(db, 'parks', d.id), { communityId: null })))
    // Notify creator
    if (c.creatorId) {
      await createNotification(
        c.creatorId, 'COMMUNITY_DELETED',
        'Comunitate ștearsă',
        `Ne pare rău, comunitatea "${c.name}" a fost ștearsă de administrator.`,
        c.id,
        user?.uid,
      )
    }
    await deleteDoc(doc(db, 'communities', c.id))
    setCommunities(prev => prev.filter(x => x.id !== c.id))
  }

  async function loadMembers(communityId: string) {
    if (members[communityId]) { setExpandedId(expandedId === communityId ? null : communityId); return }
    const snap = await getDocs(collection(db, 'communities', communityId, 'members'))
    setMembers(prev => ({
      ...prev,
      [communityId]: snap.docs.map(d => d.data() as { userId: string; displayName: string; role: string }),
    }))
    setExpandedId(communityId)
  }

  async function changeRole(communityId: string, userId: string, role: string) {
    await updateDoc(doc(db, 'communities', communityId, 'members', userId), { role })
    setMembers(prev => ({
      ...prev,
      [communityId]: prev[communityId]?.map(m => m.userId === userId ? { ...m, role } : m) ?? [],
    }))
  }

  const ROLES = ['ADMIN', 'MODERATOR', 'TRAINER', 'MEMBER']

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={backfillPoints}
        disabled={backfilling}
        className="w-full h-11 rounded-xl mb-2 border border-yellow-400/40 text-yellow-400 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {backfilling
          ? <span className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          : <Dumbbell size={15} />}
        {backfilling ? 'Se procesează...' : 'Backfill puncte (0 → workouts×10)'}
      </button>
      {backfillResult && (
        <p className="text-xs text-center text-white/60 mb-2">{backfillResult}</p>
      )}
      {communities.map(c => (
        <div key={c.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center">
            <button onClick={() => loadMembers(c.id)} className="flex-1 flex items-center gap-3 p-3.5 text-left">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)' }}>
                <span className="font-black text-brand-green text-sm">{c.name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{c.name}</p>
                <p className="text-xs text-white/40">{c.memberCount} membri</p>
              </div>
              <span className="text-white/30 text-xs">{expandedId === c.id ? '▲' : '▼'}</span>
            </button>
            <button onClick={() => deleteCommunity(c)}
              className="w-9 h-9 flex items-center justify-center mr-2 rounded-full bg-red-500/15 flex-shrink-0">
              <Trash2 size={14} className="text-red-400" />
            </button>
          </div>

          {expandedId === c.id && members[c.id] && (
            <div className="border-t border-white/8 px-3 pb-3">
              {members[c.id].map(m => (
                <div key={m.userId} className="flex items-center gap-2 py-2">
                  <p className="text-xs text-white/70 flex-1 truncate">{m.displayName}</p>
                  <select value={m.role} onChange={e => changeRole(c.id, m.userId, e.target.value)}
                    className="text-xs text-white bg-transparent border border-white/20 rounded-lg px-2 py-1 outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
