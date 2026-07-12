'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, updateDoc, deleteDoc,
  doc, query, orderBy, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import type { VerificationRequest } from '@/types'
import { X, BadgeCheck } from 'lucide-react'

export function VerificationsTab() {
  const [requests, setRequests] = useState<VerificationRequest[]>([])

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'verification_requests'), where('status', '==', 'PENDING'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as VerificationRequest))
    )
    return unsub
  }, [])

  async function approve(req: VerificationRequest) {
    await updateDoc(doc(db, 'communities', req.communityId), {
      verified: true,
      verifiedAt: serverTimestamp(),
    })
    await deleteDoc(doc(db, 'verification_requests', req.id))
  }

  async function reject(id: string) {
    await deleteDoc(doc(db, 'verification_requests', id))
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <BadgeCheck size={32} className="text-white/15" />
        <p className="text-sm text-white/35">Nicio cerere de verificare în așteptare.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map(req => (
        <div key={req.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <p className="text-sm font-bold text-white mb-0.5">{req.communityName}</p>
          <p className="text-[11px] text-white/40 mb-1">de {req.requestedByName}</p>
          <p className="text-xs text-white/60 leading-relaxed">{req.reason}</p>
          {req.createdAt && (
            <p className="text-[10px] text-white/25 mt-1">
              {req.createdAt.toDate?.()?.toLocaleDateString('ro') ?? ''}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => reject(req.id)}
              className="flex-1 h-8 rounded-xl border border-red-500/40 text-xs font-bold text-red-400 flex items-center justify-center gap-1">
              <X size={12} /> Respinge
            </button>
            <button onClick={() => approve(req)}
              className="flex-1 h-8 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1"
              style={{ backgroundColor: 'var(--accent)' }}>
              <BadgeCheck size={12} /> Verifică
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
