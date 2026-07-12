'use client'

import { useState } from 'react'
import type { PlannedTraining, CommunityMember } from '@/types'
import {
  Share2, Trash2, Clock, MapPin, Dumbbell, User, Pencil,
} from 'lucide-react'
import {
  formatTrainingDate,
} from '@/lib/utils/trainingDateTime'
import { MemberAvatar, GuestAvatar } from './Avatars'
import { toAndroidDateTime } from './shared'

function toDateInputValue(str: string): string {
  const m = str?.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}
function toTimeInputValue(str: string): string {
  const m = str?.match(/(\d{2}:\d{2})$/)
  return m ? m[1] : ''
}

export function TrainingCard({ training, communityId, myUid, members, canLoad, canDelete, canEdit, readOnly, onRsvp, onLoad, onDelete, onEdit }: {
  training: PlannedTraining
  communityId: string
  myUid: string
  members: CommunityMember[]
  canLoad: boolean
  canDelete: boolean
  canEdit: boolean
  readOnly?: boolean
  onRsvp: (s: 'GOING' | 'NOT_GOING' | 'MAYBE') => void
  onLoad: () => void
  onDelete: () => void
  onEdit: (fields: { name: string; description: string; timeStart: string; timeEnd: string }) => void
}) {
  const [showAllGoing, setShowAllGoing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [localRsvpStatus, setLocalRsvpStatus] = useState<'GOING' | 'NOT_GOING' | 'MAYBE' | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTimeStart, setEditTimeStart] = useState('')
  const [editTimeEnd, setEditTimeEnd] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  function openEdit() {
    setEditName(training.name)
    setEditDesc(training.description ?? '')
    setEditDate(toDateInputValue(training.timeStart))
    setEditTimeStart(toTimeInputValue(training.timeStart))
    setEditTimeEnd(training.timeEnd ? toTimeInputValue(training.timeEnd) : '')
    setShowEdit(true)
  }

  async function submitEdit() {
    if (savingEdit || !editName.trim() || !editDate || !editTimeStart) return
    setSavingEdit(true)
    try {
      const newTimeStart = toAndroidDateTime(editDate, editTimeStart)
      const newTimeEnd = editTimeEnd ? toAndroidDateTime(editDate, editTimeEnd) : ''
      onEdit({ name: editName.trim(), description: editDesc.trim(), timeStart: newTimeStart, timeEnd: newTimeEnd })
      setShowEdit(false)
    } finally {
      setSavingEdit(false)
    }
  }

  const myStatus = localRsvpStatus ?? training.rsvps?.[myUid]
  const rsvpEntries = Object.entries(training.rsvps ?? {})
  const goingUids   = rsvpEntries.filter(([, s]) => s === 'GOING').map(([uid]) => uid)
  const maybeUids   = rsvpEntries.filter(([, s]) => s === 'MAYBE').map(([uid]) => uid)

  // Enrich GOING with member profile info
  const goingMembers = goingUids.map(uid => {
    const m = members.find(m => m.userId === uid)
    return m ? { uid, name: m.displayName, photoUrl: m.photoUrl } : { uid, name: uid.slice(0, 6), photoUrl: null }
  })

  // Guests who confirmed
  const guestGoing = Object.entries(training.guestRsvps ?? {})
    .filter(([, g]) => g.status === 'GOING')
    .map(([gid, g]) => ({ uid: gid, name: g.name, photoUrl: null, isGuest: true }))

  const totalGoing = goingMembers.length + guestGoing.length

  function handleShare() {
    const url = `${window.location.origin}/training/${communityId}/${training.id}`
    const dateStr = formatTrainingDate(training.timeStart, training.date)
    const timeStr = training.timeStart?.slice(-5) ?? ''
    const locationStr = training.location ? `📍 ${training.location}\n` : ''
    const text = `Vino la antrenament: *${training.name}*\n📅 ${dateStr} la ${timeStr}\n${locationStr}\n${url}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: training.name, url }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
      })
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  const PREVIEW = 3
  const previewMembers = goingMembers.slice(0, PREVIEW)

  const officialStyle = training.official ? {
    backgroundColor: 'rgba(var(--accent-rgb), 0.08)',
    border: '1.5px solid rgba(var(--accent-rgb), 0.38)',
    boxShadow: '0 0 18px 0 rgba(var(--accent-rgb), 0.09), inset 0 1px 0 rgba(var(--accent-rgb), 0.13)',
  } : { backgroundColor: 'var(--app-surface)' }

  return (
    <div className="rounded-2xl mb-3" style={officialStyle}>
      <div className={training.official ? 'p-5' : 'p-4'}>

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0 mr-2">
            {training.official && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest"
                  style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.25)' }}>
                  ⭐ OFICIAL
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className={`font-black text-white ${training.official ? 'text-base' : 'text-sm'} flex-1 min-w-0 overflow-hidden break-words`}>{training.name}</p>
              {(training.timeStart || training.date) && (
                <span className="text-[11px] text-white/45 font-semibold flex-shrink-0 text-right leading-tight mt-0.5 whitespace-nowrap">
                  {formatTrainingDate(training.timeStart, training.date)}
                  {training.timeStart && <span className="text-white/30"> · {training.timeStart.slice(-5)}</span>}
                </span>
              )}
            </div>
            {training.authorName && (
              <p className="text-[10px] text-white/35 mt-0.5">de {training.authorName}</p>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleShare}
                title="Distribuie pe WhatsApp"
                className="w-8 h-8 flex items-center justify-center rounded-full text-brand-green/60 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
              >
                <Share2 size={14} />
              </button>
              {canEdit && !showEdit && !showDeleteConfirm && (
                <button onClick={openEdit} aria-label="Editează antrenament" className="w-8 h-8 flex items-center justify-center rounded-full text-brand-green/50 hover:text-brand-green hover:bg-brand-green/10 transition-colors">
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && !showEdit && !showDeleteConfirm && (
                <button onClick={() => setShowDeleteConfirm(true)} aria-label="Șterge antrenament" className="w-8 h-8 flex items-center justify-center rounded-full text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Edit form */}
        {showEdit && (
          <div className="mb-3 p-3 rounded-xl border border-brand-green/25" style={{ backgroundColor: 'rgba(30,215,95,0.05)' }}>
            <p className="text-xs font-black text-white mb-2">Editează antrenamentul</p>
            <div className="mb-2">
              <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">NUME</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={120}
                className="w-full h-9 rounded-lg px-2.5 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors" />
            </div>
            <div className="mb-2">
              <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">DESCRIERE</label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} maxLength={1000} rows={2}
                className="w-full rounded-lg px-2.5 py-2 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors resize-none" />
            </div>
            <div className="mb-2">
              <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">DATA</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="w-full h-9 rounded-lg px-2.5 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors" />
            </div>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">ORA START</label>
                <input type="time" value={editTimeStart} onChange={e => setEditTimeStart(e.target.value)}
                  className="w-full h-9 rounded-lg px-2.5 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-white/40 tracking-widest mb-1 block">ORA FINAL</label>
                <input type="time" value={editTimeEnd} onChange={e => setEditTimeEnd(e.target.value)}
                  className="w-full h-9 rounded-lg px-2.5 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowEdit(false)}
                className="flex-1 h-8 rounded-lg border border-white/20 text-xs font-semibold text-white/70 hover:bg-white/8 transition-colors">
                Anulează
              </button>
              <button onClick={submitEdit} disabled={savingEdit || !editName.trim() || !editDate || !editTimeStart}
                className="flex-1 h-8 rounded-lg bg-brand-green text-black text-xs font-bold disabled:opacity-40">
                {savingEdit ? '...' : 'Salvează'}
              </button>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mb-3 p-3 rounded-xl border border-red-500/30 bg-red-500/10">
            <p className="text-sm font-semibold text-white mb-1">Ștergi antrenamentul?</p>
            <p className="text-xs text-white/50 mb-3">Această acțiune nu poate fi anulată.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-8 rounded-lg border border-white/20 text-xs font-semibold text-white/70">
                Anulează
              </button>
              <button onClick={() => { setShowDeleteConfirm(false); onDelete() }}
                className="flex-1 h-8 rounded-lg bg-red-500/80 text-white text-xs font-bold">
                Șterge
              </button>
            </div>
          </div>
        )}

        {/* Meta */}
        {(training.location || training.timeEnd) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5">
            {training.timeEnd && (
              <div className="flex items-center gap-1 text-xs text-white/50">
                <Clock size={11} />
                <span>{training.timeStart?.slice(-5)}{` – ${training.timeEnd.slice(-5)}`}</span>
              </div>
            )}
            {training.location && (
              <div className="flex items-center gap-1 text-xs text-white/50">
                <MapPin size={11} />
                <span>{training.location}</span>
              </div>
            )}
          </div>
        )}

        {training.description && (
          <p className="text-xs text-white/50 mb-2.5 leading-relaxed">{training.description}</p>
        )}

        {/* Exercises */}
        {(training.exercises?.length ?? 0) > 0 && (
          <div className="mb-3 p-2.5 rounded-xl bg-white/5 border border-white/8">
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">EXERCIȚII</p>
            <div className="flex flex-col gap-1">
              {training.exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">{ex.name}</span>
                  <span className="text-xs text-white/40">{ex.sets}×{ex.repsPerSet}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        {(training.equipment?.length ?? 0) > 0 && (
          <div className="mb-3 p-2.5 rounded-xl bg-white/5 border border-white/8">
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">ECHIPAMENT</p>
            <div className="flex flex-wrap gap-1.5">
              {training.equipment!.map(eq => (
                <span key={eq} className="text-xs text-white/70 bg-white/8 rounded-lg px-2 py-0.5">
                  {eq === 'rings' ? '🪢 Inele' : eq === 'elastic_bands' ? '🔁 Benzi elastice' : eq === 'parallels' ? '⚙️ Paralele' : eq === 'jump_rope' ? '🪝 Coardă de sărit' : eq}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Who's coming (WhatsApp-style) ── */}
        {totalGoing > 0 && (
          <div className="mb-3">
            <button
              className="flex items-center gap-2.5 w-full text-left"
              onClick={() => setShowAllGoing(v => !v)}
            >
              {/* Overlapping avatars (members first, then guests) */}
              <div className="flex items-center">
                {previewMembers.map((m, i) => (
                  <div key={m.uid} style={{ marginLeft: i > 0 ? -8 : 0 }}>
                    <MemberAvatar photoUrl={m.photoUrl} name={m.name} size={26} />
                  </div>
                ))}
                {/* Guest avatars (up to 2 preview slots remaining) */}
                {guestGoing.slice(0, Math.max(0, PREVIEW - previewMembers.length)).map((g, i) => (
                  <div key={g.uid} style={{ marginLeft: (i === 0 && previewMembers.length === 0) ? 0 : -8 }}>
                    <GuestAvatar name={g.name} size={26} />
                  </div>
                ))}
                {totalGoing > PREVIEW && (
                  <div
                    className="rounded-full border-2 flex items-center justify-center bg-white/15 flex-shrink-0"
                    style={{ width: 26, height: 26, marginLeft: -8, borderColor: 'var(--app-surface)' }}
                  >
                    <span className="text-[9px] font-bold text-white/80">+{totalGoing - PREVIEW}</span>
                  </div>
                )}
              </div>
              {/* Summary text */}
              <span className="text-xs text-white/55 flex-1 min-w-0 truncate">
                {[...goingMembers, ...guestGoing].slice(0, 2).map(m => m.name.split(' ')[0]).join(', ')}
                {totalGoing > 2 ? ` și ${totalGoing - 2} alții merg` : ' merg'}
              </span>
              {maybeUids.length > 0 && (
                <span className="text-[10px] text-white/30 flex-shrink-0">🤔 {maybeUids.length}</span>
              )}
              <span className="text-white/25 text-xs">{showAllGoing ? '▲' : '▼'}</span>
            </button>

            {/* Expanded attendees list */}
            {showAllGoing && (
              <div className="mt-2 rounded-xl overflow-hidden border border-white/8">
                {goingMembers.map((m, i) => (
                  <div key={m.uid} className={`flex items-center gap-2.5 px-3 py-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                    <MemberAvatar photoUrl={m.photoUrl} name={m.name} size={24} />
                    <span className="text-xs font-semibold text-white/75">{m.name}</span>
                    {m.uid === myUid && <span className="text-[10px] text-brand-green ml-auto">Tu</span>}
                  </div>
                ))}
                {/* Guests */}
                {guestGoing.map((g, _i) => (
                  <div key={g.uid} className={`flex items-center gap-2.5 px-3 py-2 border-t border-white/5`}>
                    <GuestAvatar name={g.name} size={24} />
                    <span className="text-xs font-semibold text-white/75">{g.name}</span>
                    <span className="text-[10px] text-white/30 ml-auto flex items-center gap-0.5">
                      <User size={9} />invitat
                    </span>
                  </div>
                ))}
                {maybeUids.map((uid) => {
                  const m = members.find(mem => mem.userId === uid)
                  if (!m) return null
                  return (
                    <div key={uid} className="flex items-center gap-2.5 px-3 py-2 border-t border-white/5">
                      <MemberAvatar photoUrl={m.photoUrl} name={m.displayName} size={24} />
                      <span className="text-xs font-semibold text-white/50">{m.displayName}</span>
                      <span className="text-[10px] text-white/30 ml-auto">poate</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* No attendees yet */}
        {totalGoing === 0 && (
          <p className="text-xs text-white/25 mb-3">Nimeni nu a confirmat încă</p>
        )}

        {/* RSVP buttons */}
        {!readOnly && (
          <div className="flex gap-2">
            {(['GOING', 'MAYBE', 'NOT_GOING'] as const).map(status => (
              <button key={status}
                onClick={() => { setLocalRsvpStatus(status); onRsvp(status) }}
                className={`flex-1 h-8 rounded-lg text-xs font-bold transition-colors border ${
                  myStatus === status
                    ? 'bg-brand-green text-black border-brand-green'
                    : 'border-white/15 text-white/50 hover:bg-white/8'
                }`}>
                {status === 'GOING' ? 'Merg' : status === 'MAYBE' ? 'Poate' : 'Nu merg'}
              </button>
            ))}
            {canLoad && (
              <button onClick={onLoad} className="h-8 px-3 rounded-lg text-xs font-bold bg-brand-green text-black flex items-center gap-1 flex-shrink-0">
                <Dumbbell size={12} /> Încarcă
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
