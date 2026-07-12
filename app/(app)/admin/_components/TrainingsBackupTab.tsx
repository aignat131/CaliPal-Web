'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, getDocs, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { Shield, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react'

interface BackupDoc {
  id: string
  name: string
  timeStart: string
  authorName: string
  sourceType: 'community' | 'park'
  sourceId: string
  originalTrainingId: string
  backedUpAt: Timestamp | null
  deletedAt?: Timestamp | null
  deletedByUid?: string
  restoredAt?: Timestamp | null
  createdAt?: Timestamp | null
}

interface VerifyMismatch {
  sourceType: string
  sourceId: string
  sourceName: string
  backupCount: number
  liveCount: number
}

export function TrainingsBackupTab() {
  const [backups, setBackups] = useState<BackupDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set())
  const [verifying, setVerifying] = useState(false)
  const [mismatches, setMismatches] = useState<VerifyMismatch[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'deleted'>('all')
  const [communities, setCommunities] = useState<Record<string, string>>({})

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'training_backups'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }) as BackupDoc)
      items.sort((a, b) => {
        const ta = a.backedUpAt?.toDate?.()?.getTime() ?? 0
        const tb = b.backedUpAt?.toDate?.()?.getTime() ?? 0
        return tb - ta
      })
      setBackups(items)
      setLoading(false)
    })
    // Load community names
    getDocs(collection(db, 'communities')).then(snap => {
      const map: Record<string, string> = {}
      snap.docs.forEach(d => { map[d.id] = (d.data().name as string) ?? d.id })
      setCommunities(map)
    })
    return unsub
  }, [])

  async function handleRestore(backupId: string) {
    setRestoring(backupId)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/restore-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backupId }),
      })
      const data = await res.json()
      if (data.ok) {
        setRestoredIds(prev => new Set(prev).add(backupId))
      } else {
        alert(`Eroare: ${data.reason}`)
      }
    } catch {
      alert('Eroare de rețea.')
    } finally {
      setRestoring(null)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    setMismatches(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/verify-trainings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.ok) {
        setMismatches(data.mismatches)
      } else {
        alert(`Eroare: ${data.reason}`)
      }
    } catch {
      alert('Eroare de rețea.')
    } finally {
      setVerifying(false)
    }
  }

  const filtered = filter === 'all' ? backups
    : filter === 'deleted' ? backups.filter(b => b.deletedAt)
    : backups.filter(b => !b.deletedAt)

  // Group by source
  const grouped = new Map<string, BackupDoc[]>()
  for (const b of filtered) {
    const key = `${b.sourceType}_${b.sourceId}`
    const arr = grouped.get(key) ?? []
    arr.push(b)
    grouped.set(key, arr)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs text-white/40">{backups.length} backup-uri totale</p>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-bold bg-yellow-400/15 text-yellow-400 border border-yellow-400/25 disabled:opacity-40"
        >
          {verifying
            ? <span className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            : <AlertTriangle size={12} />}
          {verifying ? 'Se verifică...' : 'Verifică toate'}
        </button>
      </div>

      {/* Verify results */}
      {mismatches !== null && (
        <div className={`rounded-2xl p-3.5 mb-4 border ${
          mismatches.length === 0
            ? 'border-brand-green/30 bg-brand-green/5'
            : 'border-red-500/30 bg-red-500/5'
        }`}>
          {mismatches.length === 0 ? (
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-brand-green" />
              <p className="text-sm font-bold text-brand-green">Totul e în regulă — backup-urile coincid cu antrenamentele live.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-400" />
                <p className="text-sm font-bold text-red-400">{mismatches.length} nepotriviri găsite!</p>
              </div>
              {mismatches.map(m => (
                <div key={`${m.sourceType}_${m.sourceId}`} className="flex items-center justify-between py-1.5 border-t border-white/6">
                  <div>
                    <p className="text-xs text-white font-bold">{m.sourceName}</p>
                    <p className="text-[10px] text-white/40">{m.sourceType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/60">Backup: <span className="text-white font-bold">{m.backupCount}</span></p>
                    <p className="text-xs text-white/60">Live: <span className={`font-bold ${m.liveCount < m.backupCount ? 'text-red-400' : 'text-white'}`}>{m.liveCount}</span></p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Filter buttons */}
      <div className="flex gap-1 mb-4">
        {(['all', 'active', 'deleted'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-7 px-2.5 rounded-full text-[10px] font-bold transition-colors ${
              filter === f ? 'bg-brand-green text-black' : 'bg-white/8 text-white/40'
            }`}
          >
            {f === 'all' ? `Toate (${backups.length})` : f === 'active' ? `Active (${backups.filter(b => !b.deletedAt).length})` : `Șterse (${backups.filter(b => b.deletedAt).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Shield size={40} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/40">
            {backups.length === 0 ? 'Niciun backup încă. Backup-urile se creează automat la fiecare antrenament nou.' : 'Niciun rezultat pentru filtrul selectat.'}
          </p>
        </div>
      )}

      {/* Grouped list */}
      <div className="flex flex-col gap-4">
        {Array.from(grouped.entries()).map(([key, items]) => {
          const first = items[0]
          const sourceName = first.sourceType === 'community'
            ? communities[first.sourceId] ?? first.sourceId
            : first.sourceId
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[10px] font-bold text-white/35 tracking-widest uppercase">
                  {first.sourceType === 'community' ? '👥' : '📍'} {sourceName}
                </span>
                <span className="text-[10px] text-white/20">({items.length})</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map(b => {
                  const isDeleted = !!b.deletedAt
                  const justRestored = restoredIds.has(b.id)
                  return (
                    <div key={b.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: 'var(--app-surface)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className={`text-sm font-bold truncate ${isDeleted ? 'text-red-400/70 line-through' : 'text-white'}`}>
                            {b.name}
                          </p>
                          {isDeleted && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 flex-shrink-0">ȘTERS</span>
                          )}
                          {justRestored && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/20 text-brand-green flex-shrink-0">RESTAURAT</span>
                          )}
                          {!isDeleted && !justRestored && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/15 text-brand-green/60 flex-shrink-0">OK</span>
                          )}
                        </div>
                        <p className="text-xs text-white/40">{b.timeStart} · {b.authorName}</p>
                        {b.backedUpAt && (
                          <p className="text-[10px] text-white/25 mt-0.5">
                            Backup: {b.backedUpAt.toDate?.()?.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRestore(b.id)}
                        disabled={restoring === b.id || justRestored}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-bold border transition-colors disabled:opacity-40 flex-shrink-0 border-brand-green/30 text-brand-green hover:bg-brand-green/10"
                      >
                        {restoring === b.id
                          ? <span className="w-3.5 h-3.5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                          : <RotateCcw size={12} />}
                        {justRestored ? 'Restaurat' : 'Restaurează'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
