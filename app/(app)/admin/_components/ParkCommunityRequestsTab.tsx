'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { createNotification } from '@/lib/firebase/notifications'
import { useAuth } from '@/lib/hooks/useAuth'
import type { ParkCommunityRequest } from '@/types'
import { Check, X, MapPin } from 'lucide-react'

export function ParkCommunityRequestsTab() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<ParkCommunityRequest[]>([])

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, 'park_community_requests'),
        where('status', 'in', ['PENDING', 'NEW'])
      ),
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as ParkCommunityRequest)
        items.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0))
        setRequests(items)
      }
    )
    return unsub
  }, [])

  // Approve: link park to community; if NEW also verify the community
  async function approve(req: ParkCommunityRequest) {
    await updateDoc(doc(db, 'parks', req.parkId), { communityId: req.communityId })
    if (req.status === 'NEW') {
      await updateDoc(doc(db, 'communities', req.communityId), { verified: true, verifiedAt: serverTimestamp() })
      await createNotification(
        req.requestedByUid, 'COMMUNITY_REQUEST_APPROVED',
        'Comunitate aprobată! ✅',
        `Comunitatea "${req.communityName}" a fost aprobată și asociată parcului "${req.parkName}". A primit și badge-ul verificat!`,
        req.communityId,
        user?.uid,
      )
    } else {
      await createNotification(
        req.requestedByUid, 'COMMUNITY_REQUEST_APPROVED',
        'Cerere aprobată! ✅',
        `Comunitatea "${req.communityName}" a fost asociată parcului "${req.parkName}".`,
        req.communityId,
        user?.uid,
      )
    }
    await deleteDoc(doc(db, 'park_community_requests', req.id))
  }

  // Reject: for NEW also delete the community; for PENDING just delete request
  async function reject(req: ParkCommunityRequest) {
    if (req.status === 'NEW') {
      if (!confirm(`Respingi și ștergi comunitatea "${req.communityName}"?`)) return
      await updateDoc(doc(db, 'parks', req.parkId), { communityId: null })
      await deleteDoc(doc(db, 'communities', req.communityId))
      await createNotification(
        req.requestedByUid, 'COMMUNITY_REQUEST_REJECTED',
        'Cerere respinsă',
        `Cererea pentru comunitatea "${req.communityName}" la parcul "${req.parkName}" a fost respinsă de administrator.`,
        undefined,
        user?.uid,
      )
    }
    await deleteDoc(doc(db, 'park_community_requests', req.id))
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <MapPin size={32} className="text-white/15" />
        <p className="text-sm text-white/35">Nicio cerere de asociere în așteptare.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map(req => (
        <div key={req.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="flex items-center gap-2 mb-1">
            {req.status === 'NEW'
              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/20 text-brand-green">🏗️ COMUNITATE NOUĂ</span>
              : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">🔗 ASOCIERE</span>
            }
          </div>
          <p className="text-sm font-bold text-white mb-0.5">{req.parkName}</p>
          <p className="text-xs text-brand-green mb-0.5">→ {req.communityName}</p>
          <p className="text-[11px] text-white/40">de {req.requestedByName}</p>
          {req.createdAt && (
            <p className="text-[10px] text-white/25 mt-0.5">
              {req.createdAt.toDate?.()?.toLocaleDateString('ro') ?? ''}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => reject(req)}
              className="flex-1 h-8 rounded-xl border border-red-500/40 text-xs font-bold text-red-400 flex items-center justify-center gap-1">
              <X size={12} /> Respinge
            </button>
            <button onClick={() => approve(req)}
              className="flex-1 h-8 rounded-xl bg-brand-green text-black text-xs font-bold flex items-center justify-center gap-1">
              <Check size={12} /> Aprobă
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
