'use client'

import { useState } from 'react'
import {
  collection, doc, updateDoc, addDoc, setDoc, getDocs,
  query, where, serverTimestamp, arrayUnion, increment, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { useT } from '@/lib/context/LanguageContext'
import type { ParkDoc, ParkCommunityRequest, CommunityDoc, PlannedTraining } from '@/types'
import { X } from 'lucide-react'
import Link from 'next/link'

// ── Park Community Modal ──────────────────────────────────────────────────────

export function ParkCommunityModal({
  park, uid: _uid, userAdminCommunities, onClose, onSubmitted: _onSubmitted, onDirectAssociated,
}: {
  park: ParkDoc
  uid: string
  userAdminCommunities: CommunityDoc[]
  onClose: () => void
  onSubmitted: (req: ParkCommunityRequest) => void
  onDirectAssociated: () => void
}) {
  const t = useT()
  const [selectedCommunityId, setSelectedCommunityId] = useState(userAdminCommunities[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)

  // Admins (communities in userAdminCommunities) associate directly — no request needed
  async function submit() {
    if (!selectedCommunityId || submitting) return
    const community = userAdminCommunities.find(c => c.id === selectedCommunityId)
    if (!community) return
    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'parks', park.id), { communityId: community.id })
      onDirectAssociated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-black text-white">{t('map.assoc_modal_title')}</p>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/50 mb-4">{park.name}</p>

        {userAdminCommunities.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-white/50 mb-3">{t('map.no_admin_comms')}</p>
            <Link href="/community/create">
              <button className="h-9 px-4 rounded-full bg-brand-green text-black text-xs font-bold">
                {t('map.create_community')}
              </button>
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1">{t('map.select_community')}</p>
            <p className="text-xs text-white/35 mb-3">{t('map.assoc_direct_note')}</p>
            <div className="flex flex-col gap-2 mb-4">
              {userAdminCommunities.map(c => (
                <button key={c.id}
                  onClick={() => setSelectedCommunityId(c.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selectedCommunityId === c.id
                      ? 'border-brand-green/50 bg-brand-green/10'
                      : 'border-white/10 bg-white/4'
                  }`}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: selectedCommunityId === c.id ? '#1ED75F' : '#ffffff30' }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.name}</p>
                    <p className="text-xs text-white/40">{c.memberCount} {t('common.members')}</p>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={submit} disabled={submitting || !selectedCommunityId}
              className="w-full h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
              {submitting ? '...' : t('map.assoc_direct_btn')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Community For Park Modal ──────────────────────────────────────────

export function CreateCommunityForParkModal({
  park, uid, userName, onClose, onPending,
}: {
  park: ParkDoc
  uid: string
  userName: string
  onClose: () => void
  onPending: (req: ParkCommunityRequest) => void
}) {
  const t = useT()
  const { photoUrl: myPhoto } = useMyProfile()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors"

  async function create() {
    if (!name.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      // 3/day rate limit — fetch user's NEW requests, filter client-side by today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const rateSnap = await getDocs(query(
        collection(db, 'park_community_requests'),
        where('requestedByUid', '==', uid),
        where('status', '==', 'NEW')
      ))
      const todayCount = rateSnap.docs.filter(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts >= todayStart
      }).length
      if (todayCount >= 3) {
        setError(t('map.rate_limit_3'))
        setSaving(false)
        return
      }

      const commRef = await addDoc(collection(db, 'communities'), {
        name: name.trim(),
        description: description.trim(),
        location: park.address ? `${park.address}${park.city ? ', ' + park.city : ''}` : park.name,
        latitude: park.latitude,
        longitude: park.longitude,
        creatorId: uid,
        creatorName: userName,
        memberCount: 1,
        isPublic,
        imageUrl: '',
        verified: false,
        createdAt: serverTimestamp(),
      })
      // Add creator as ADMIN member
      await setDoc(doc(db, 'communities', commRef.id, 'members', uid), {
        userId: uid,
        displayName: userName,
        role: 'ADMIN',
        level: 1,
        points: 0,
        photoUrl: myPhoto || '',
        joinedAt: serverTimestamp(),
      })
      // Add to user's joined communities
      await updateDoc(doc(db, 'users', uid), { joinedCommunityIds: arrayUnion(commRef.id) })
      // Submit for admin review — park will be linked after approval
      const reqRef = await addDoc(collection(db, 'park_community_requests'), {
        parkId: park.id,
        parkName: park.name,
        communityId: commRef.id,
        communityName: name.trim(),
        requestedByUid: uid,
        requestedByName: userName,
        status: 'NEW',
        createdAt: serverTimestamp(),
      })
      const req: ParkCommunityRequest = {
        id: reqRef.id,
        parkId: park.id,
        parkName: park.name,
        communityId: commRef.id,
        communityName: name.trim(),
        requestedByUid: uid,
        requestedByName: userName,
        status: 'NEW',
        createdAt: null,
      }
      onPending(req)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-black text-white">{t('map.new_comm_title')}</p>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">{t('map.park_label', { name: park.name })}</p>
        <div className="flex flex-col gap-2.5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('map.comm_name_placeholder')}
            maxLength={80} className={inputCls} />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t('map.comm_desc_placeholder')}
            rows={2}
            maxLength={1000}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors resize-none" />
          <button onClick={() => setIsPublic(p => !p)}
            className="flex items-center gap-2 p-3 rounded-xl border border-white/12">
            <div className={`w-8 h-5 rounded-full transition-colors relative ${isPublic ? 'bg-brand-green' : 'bg-white/20'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isPublic ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-white/70">{isPublic ? t('map.public_label') : t('map.private_label')}</span>
          </button>
          <p className="text-[11px] text-white/35 px-1">
            {t('map.comm_request_note')}
          </p>
          {error && <p className="text-xs text-red-400 px-1">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60">{t('map.cancel')}</button>
            <button onClick={create} disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
              {saving ? '...' : t('create.send_request_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Standalone Park Training Modal ───────────────────────────────────────

export function AddParkTrainingModal({
  park, uid, userName, onClose, onAdded,
}: {
  park: ParkDoc
  uid: string
  userName: string
  onClose: () => void
  onAdded: (t: PlannedTraining) => void
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const t = useT()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('20:30')
  const [saving, setSaving] = useState(false)
  const [rateError, setRateError] = useState('')

  function fmt(dateStr: string, time: string): string {
    if (!dateStr || !time) return ''
    const [yyyy, mm, dd] = dateStr.split('-')
    return `${dd}/${mm}/${yyyy} ${time}`
  }

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    setRateError('')
    try {
      // Rate limit: max 5 trainings per day per park per user
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const rateCol = park.communityId
        ? collection(db, 'communities', park.communityId, 'trainings')
        : collection(db, 'parks', park.id, 'trainings')
      const rateSnap = await getDocs(query(rateCol, where('authorId', '==', uid)))
      const todayCount = rateSnap.docs.filter(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts >= todayStart
      }).length
      if (todayCount >= 5) {
        setRateError(t('map.train_rate_limit'))
        setSaving(false)
        return
      }
      const payload = {
        name:            name.trim(),
        description:     desc.trim(),
        timeStart:       fmt(date, start),
        timeEnd:         fmt(date, end),
        location:        park.name,
        authorId:        uid,
        authorName:      userName,
        authorCoach:     false,
        authorAdmin:     false,
        official:        false,
        reminderMinutes: 30,
        rsvps:           { [uid]: 'GOING' },
        rsvpNames:       { [uid]: userName },
        exercises:       [],
        createdAt:       serverTimestamp(),
      }
      // Parks linked to a community → save to the community's trainings collection
      // so the training appears in both the community history and the map's upcoming list.
      // Standalone parks → save to the park's own trainings collection.
      const trainingsCol = park.communityId
        ? collection(db, 'communities', park.communityId, 'trainings')
        : collection(db, 'parks', park.id, 'trainings')
      // Atomic batch: create training + mirror + backup together
      const sourceType = park.communityId ? 'community' : 'park'
      const sourceId = park.communityId || park.id
      const mirrorCol = park.communityId
        ? collection(db, 'communities', park.communityId, 'trainings_safe')
        : collection(db, 'parks', park.id, 'trainings_safe')
      const batch = writeBatch(db)
      const ref = doc(trainingsCol)
      const mirrorRef = doc(mirrorCol, ref.id)
      const backupRef = doc(db, 'training_backups', `${sourceType}_${sourceId}_${ref.id}`)
      batch.set(ref, payload)
      batch.set(mirrorRef, payload)
      batch.set(backupRef, {
        ...payload,
        sourceType,
        sourceId,
        originalTrainingId: ref.id,
        backedUpAt: serverTimestamp(),
      })
      await batch.commit()
      // Increment the park's upcoming training counter so the pin turns green
      await updateDoc(doc(db, 'parks', park.id), { upcomingTrainingCount: increment(1) })
      onAdded({ id: ref.id, ...payload, createdAt: null } as unknown as PlannedTraining)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-blue-500/50 transition-colors"

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-black text-white">{t('map.train_modal_title')}</p>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/60" />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">{park.name}</p>
        <div className="flex flex-col gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('map.train_name_placeholder')}
            maxLength={120} className={inputCls} />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('map.train_desc_placeholder')}
            maxLength={1000} className={inputCls} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <input type="time" value={start} onChange={e => setStart(e.target.value)}
              className={`flex-1 min-w-0 ${inputCls}`} />
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
              className={`flex-1 min-w-0 ${inputCls}`} />
          </div>
          {rateError && <p className="text-xs text-red-400 text-center">{rateError}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60">{t('map.cancel')}</button>
            <button onClick={save} disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-xl text-black text-sm font-black disabled:opacity-40"
              style={{ backgroundColor: '#1ED75F' }}>
              {saving ? '...' : t('map.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
