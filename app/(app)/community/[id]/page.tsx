'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  doc, collection, onSnapshot, addDoc, deleteDoc,
  updateDoc, setDoc, serverTimestamp, getDoc, query, orderBy, getDocs, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import type {
  CommunityDoc, CommunityMember, CommunityPost,
  PlannedTraining, MemberRole, PostComment,
} from '@/types'
import { ROLE_LABELS, conversationId } from '@/types'
import {
  ArrowLeft, MessageSquare, Send, Trash2, Plus,
  UserPlus, Check, Clock, MapPin, Calendar, Dumbbell, Users,
  Heart, MessageCircle, MoreVertical, User, Trophy,
} from 'lucide-react'
import Link from 'next/link'

const SUPERADMIN = 'aignat131@gmail.com'

const ROLE_COLORS: Record<MemberRole, string> = {
  ADMIN: '#FFB800',
  MODERATOR: '#3B82F6',
  TRAINER: '#F97316',
  MEMBER: '#1ED75F',
}

function formatTrainingDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return iso }
}

export default function CommunityDetailPage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [community, setCommunity] = useState<CommunityDoc | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [trainings, setTrainings] = useState<PlannedTraining[]>([])
  const [isMember, setIsMember] = useState(false)
  const [myRole, setMyRole] = useState<MemberRole>('MEMBER')
  const [tab, setTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(`comm_detail_tab_${params.id}`)
      if (saved !== null) return parseInt(saved)
    }
    return 2 // default: Membri
  })
  const [loading, setLoading] = useState(true)
  const [postText, setPostText] = useState('')
  const [posting, setPosting] = useState(false)
  const [showAddTraining, setShowAddTraining] = useState(false)
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [verifyReqPending, setVerifyReqPending] = useState(false)
  const [showVerifyForm, setShowVerifyForm] = useState(false)
  const [verifyReason, setVerifyReason] = useState('')
  const [verifySaving, setVerifySaving] = useState(false)
  const [verifySent, setVerifySent] = useState(false)

  const isSuperAdmin = user?.email === SUPERADMIN

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'communities', id), snap => {
      if (snap.exists()) setCommunity({ id: snap.id, ...snap.data() } as CommunityDoc)
      setLoading(false)
    })
    return unsub
  }, [id])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'communities', id, 'members'), snap => {
      const list = snap.docs.map(d => d.data() as CommunityMember)
      setMembers(list)
      if (user) {
        const me = list.find(m => m.userId === user.uid)
        setIsMember(!!me)
        setMyRole((me?.role as MemberRole) ?? 'MEMBER')
      }
    })
    return unsub
  }, [id, user])

  useEffect(() => {
    const q = query(collection(db, 'communities', id, 'posts'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityPost))
    })
  }, [id])

  useEffect(() => {
    const q = query(collection(db, 'communities', id, 'trainings'), orderBy('date', 'desc'))
    return onSnapshot(q,
      snap => { setTrainings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)) },
      () => { /* non-members can't read trainings — silently ignore */ }
    )
  }, [id])

  // Load friend/pending status for member tab
  const loadSocialStatus = useCallback(async () => {
    if (!user) return
    try {
      const [friendsSnap, sentSnap] = await Promise.all([
        getDocs(collection(db, 'users', user.uid, 'friends')),
        // Single where clause — no composite index needed
        getDocs(query(collection(db, 'friend_requests'), where('fromUid', '==', user.uid))),
      ])
      setFriendIds(new Set(friendsSnap.docs.map(d => d.id)))
      setPendingIds(new Set(
        sentSnap.docs
          .filter(d => d.data().status === 'PENDING')
          .map(d => d.data().toUid as string)
      ))
    } catch {
      // Non-critical — friend status just won't show
    }
  }, [user])

  useEffect(() => {
    sessionStorage.setItem(`comm_detail_tab_${id}`, String(tab))
    if (tab === 2) loadSocialStatus()
  }, [tab, id, loadSocialStatus])

  // Check for pending verification request on mount
  useEffect(() => {
    getDocs(query(
      collection(db, 'verification_requests'),
      where('communityId', '==', id),
      where('status', '==', 'PENDING')
    )).then(snap => setVerifyReqPending(!snap.empty))
  }, [id])

  // Auto-delete expired trainings (staff/superAdmin only)
  useEffect(() => {
    if (!trainings.length) return
    const canDelete = isSuperAdmin || myRole === 'ADMIN' || myRole === 'MODERATOR' || myRole === 'TRAINER'
    if (!canDelete) return
    const now = new Date()
    trainings.forEach(t => {
      if (!t.date || !t.timeEnd) return
      const end = new Date(`${t.date}T${t.timeEnd}`)
      if (end < now) {
        deleteDoc(doc(db, 'communities', id, 'trainings', t.id)).catch(() => {})
      }
    })
  }, [trainings, isSuperAdmin, myRole, id])

  async function addPost() {
    if (!user || !postText.trim() || posting) return
    setPosting(true)
    try {
      await addDoc(collection(db, 'communities', id, 'posts'), {
        authorId: user.uid,
        authorName: myName,
        authorRole: myRole,
        content: postText.trim(),
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      })
      setPostText('')
    } finally { setPosting(false) }
  }

  async function deletePost(postId: string) {
    await deleteDoc(doc(db, 'communities', id, 'posts', postId))
  }

  async function rsvp(trainingId: string, status: 'GOING' | 'NOT_GOING' | 'MAYBE') {
    if (!user) return
    await updateDoc(doc(db, 'communities', id, 'trainings', trainingId), {
      [`rsvps.${user.uid}`]: status,
    })
  }

  function loadTraining(training: PlannedTraining) {
    if (!training.exercises?.length) return
    sessionStorage.setItem('calipal_load_training', JSON.stringify({
      name: training.name,
      exercises: training.exercises,
    }))
    router.push('/workout')
  }

  function goToChat(otherUid: string, otherName: string) {
    if (!user) return
    const convId = conversationId(user.uid, otherUid)
    router.push(`/chat/${convId}?otherUserId=${otherUid}&otherName=${encodeURIComponent(otherName)}`)
  }

  async function sendFriendRequest(toMember: CommunityMember) {
    if (!user) return
    const reqId = `${user.uid}_${toMember.userId}`
    try {
      await setDoc(doc(db, 'friend_requests', reqId), {
        id: reqId,
        fromUid: user.uid,
        fromName: myName,
        fromPhotoUrl: myPhoto,
        toUid: toMember.userId,
        toName: toMember.displayName,
        status: 'PENDING',
        sentAt: serverTimestamp(),
      })
      setPendingIds(prev => new Set(prev).add(toMember.userId))
    } catch {
      // Silently ignore — button stays as UserPlus, user can retry
    }
  }

  async function submitVerifyRequest() {
    if (!user || !verifyReason.trim()) return
    setVerifySaving(true)
    try {
      await addDoc(collection(db, 'verification_requests'), {
        communityId: id,
        communityName: community?.name ?? '',
        requestedByUid: user.uid,
        requestedByName: myName,
        reason: verifyReason.trim(),
        status: 'PENDING',
        createdAt: serverTimestamp(),
      })
      setShowVerifyForm(false)
      setVerifyReqPending(true)
      setVerifySent(true)
    } finally {
      setVerifySaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const sortedMembers = [...members].sort((a, b) => {
    const order = ['ADMIN', 'MODERATOR', 'TRAINER', 'MEMBER']
    return order.indexOf(a.role) - order.indexOf(b.role)
  })

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      {/* Header */}
      {community?.imageUrl ? (
        /* ── Cover image header ── */
        <div className="border-b border-white/8">
          <div className="relative overflow-hidden" style={{ height: 140 }}>
            <img src={community.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, var(--app-bg) 100%)' }} />
            <button
              onClick={() => router.back()}
              className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            {community.verified && (
              <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(59,130,246,0.3)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }}>
                ✓ Verificat
              </span>
            )}
            <div className="absolute bottom-3 left-4 right-4">
              <p className="font-black text-white text-base leading-tight drop-shadow">{community.name}</p>
              <p className="text-xs text-white/65">{community.memberCount ?? 0} membri · {isMember ? 'Membru' : 'Vizitator'}</p>
            </div>
          </div>
          {myRole === 'ADMIN' && community && !community.verified && (
            <div className="px-4 pb-3 pt-2">
              <VerifyArea
                verifySent={verifySent}
                verifyReqPending={verifyReqPending}
                showVerifyForm={showVerifyForm}
                verifyReason={verifyReason}
                verifySaving={verifySaving}
                onShowForm={() => setShowVerifyForm(true)}
                onHideForm={() => setShowVerifyForm(false)}
                onChangeReason={setVerifyReason}
                onSubmit={submitVerifyRequest}
              />
            </div>
          )}
        </div>
      ) : (
        /* ── Plain text header (no image) ── */
        <div className="px-4 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ArrowLeft size={18} className="text-white/80" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-white text-base truncate">{community?.name ?? '...'}</p>
                {community?.verified && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#3B82F622', color: '#3B82F6', border: '1px solid #3B82F640' }}>
                    ✓ Verificat
                  </span>
                )}
              </div>
              <p className="text-xs text-white/45">{community?.memberCount ?? 0} membri · {isMember ? 'Membru' : 'Vizitator'}</p>
            </div>
          </div>
          {myRole === 'ADMIN' && community && !community.verified && (
            <div className="mt-2.5">
              <VerifyArea
                verifySent={verifySent}
                verifyReqPending={verifyReqPending}
                showVerifyForm={showVerifyForm}
                verifyReason={verifyReason}
                verifySaving={verifySaving}
                onShowForm={() => setShowVerifyForm(true)}
                onHideForm={() => setShowVerifyForm(false)}
                onChangeReason={setVerifyReason}
                onSubmit={submitVerifyRequest}
              />
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {[
          { label: 'Feed', Icon: MessageSquare },
          { label: 'Antrenamente', Icon: Dumbbell },
          { label: 'Membri', Icon: Users },
          { label: 'Clasament', Icon: Trophy },
        ].map(({ label, Icon }, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`flex-1 py-3 text-xs font-bold transition-colors flex flex-col items-center gap-0.5 ${
              tab === i ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/40'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">

        {/* ── Feed ── */}
        {tab === 0 && (
          <div>
            {isMember && (
              <div className="flex gap-2 mb-4">
                <input
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addPost()}
                  placeholder="Scrie ceva..."
                  className="flex-1 h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
                />
                <button onClick={addPost} disabled={posting || !postText.trim()}
                  className="w-11 h-11 rounded-xl bg-brand-green disabled:opacity-40 flex items-center justify-center">
                  <Send size={15} className="text-black" />
                </button>
              </div>
            )}
            {posts.length === 0
              ? <p className="text-sm text-white/35 text-center py-8">Niciun post încă. Fii primul!</p>
              : posts.map(p => (
                <PostCard
                  key={p.id}
                  post={p}
                  communityId={id}
                  myUid={user?.uid ?? ''}
                  myName={myName}
                  myRole={myRole}
                  isSuperAdmin={isSuperAdmin}
                  onDelete={() => deletePost(p.id)}
                />
              ))}
          </div>
        )}

        {/* ── Antrenamente ── */}
        {tab === 1 && (
          <div>
            {isMember && (myRole === 'ADMIN' || myRole === 'TRAINER' || myRole === 'MODERATOR' || isSuperAdmin) && (
              <button onClick={() => setShowAddTraining(true)}
                className="w-full h-11 rounded-xl mb-4 border border-brand-green/40 text-brand-green text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-green/10 transition-colors">
                <Plus size={16} /> Adaugă antrenament
              </button>
            )}
            {showAddTraining && (
              <AddTrainingForm
                communityId={id}
                userId={user?.uid ?? ''}
                userName={myName}
                isStaff={myRole === 'ADMIN' || myRole === 'TRAINER' || myRole === 'MODERATOR' || isSuperAdmin}
                onClose={() => setShowAddTraining(false)}
              />
            )}
            {trainings.length === 0
              ? (
                <div className="text-center py-12">
                  <Dumbbell size={36} className="text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/35">Niciun antrenament planificat.</p>
                </div>
              )
              : [...trainings]
                  .sort((a, b) => {
                    if (a.official && !b.official) return -1
                    if (!a.official && b.official) return 1
                    return a.date.localeCompare(b.date)
                  })
                  .map(t => (
                <TrainingCard
                  key={t.id}
                  training={t}
                  myUid={user?.uid ?? ''}
                  canLoad={isMember && (t.exercises?.length ?? 0) > 0}
                  canDelete={isSuperAdmin || myRole === 'ADMIN' || myRole === 'MODERATOR' || myRole === 'TRAINER'}
                  onRsvp={status => rsvp(t.id, status)}
                  onLoad={() => loadTraining(t)}
                  onDelete={() => deleteDoc(doc(db, 'communities', id, 'trainings', t.id))}
                />
              ))}
          </div>
        )}

        {/* ── Membri ── */}
        {tab === 2 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-1">{members.length} MEMBRI</p>
            {sortedMembers.map(m => {
              const roleColor = ROLE_COLORS[m.role as MemberRole] ?? '#1ED75F'
              const isFriend = friendIds.has(m.userId)
              const isPending = pendingIds.has(m.userId)
              const isMe = m.userId === user?.uid

              return (
                <div key={m.userId} className="flex items-center gap-2 px-3 py-3 rounded-2xl" style={{ backgroundColor: 'var(--app-surface)' }}>
                  {/* Avatar with role ring */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: `${roleColor}22`, border: `2px solid ${roleColor}` }}>
                      {m.photoUrl
                        ? <img src={m.photoUrl} alt={m.displayName} className="w-full h-full object-cover" />
                        : <span className="text-sm font-black" style={{ color: roleColor }}>{m.displayName.charAt(0).toUpperCase()}</span>}
                    </div>
                    {m.role === 'ADMIN' && (
                      <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">👑</span>
                    )}
                    {m.role === 'TRAINER' && (
                      <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">🏋️</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">{m.displayName}</span>
                      {isMe && <span className="text-[9px] font-bold text-white/30">TU</span>}
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: `${roleColor}18`, color: roleColor }}>
                      {ROLE_LABELS[m.role as MemberRole]}
                    </span>
                  </div>

                  {/* Points */}
                  <span className="text-sm font-black text-brand-green flex-shrink-0">
                    {m.points ?? 0}<span className="text-[10px] font-normal text-white/30 ml-0.5">pts</span>
                  </span>

                  {/* Three-dots menu (right side) */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === m.userId ? null : m.userId)}
                      className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 rounded-full hover:bg-white/8"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === m.userId && (
                      <div
                        className="absolute right-0 top-9 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[150px]"
                        style={{ backgroundColor: 'var(--app-bg)' }}
                      >
                        <Link href={isMe ? '/profile' : `/profile/${m.userId}`} onClick={() => setOpenMenuId(null)}>
                          <div className="px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2">
                            <User size={14} /> Vezi profil
                          </div>
                        </Link>
                        {!isMe && (
                          <>
                            <button
                              onClick={() => { goToChat(m.userId, m.displayName); setOpenMenuId(null) }}
                              className="w-full px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"
                            >
                              <MessageSquare size={14} /> Mesaj
                            </button>
                            {!isFriend && !isPending && (
                              <button
                                onClick={() => { sendFriendRequest(m); setOpenMenuId(null) }}
                                className="w-full px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"
                              >
                                <UserPlus size={14} /> Adaugă prieten
                              </button>
                            )}
                            {isFriend && (
                              <div className="px-3 py-2.5 text-sm text-brand-green flex items-center gap-2">
                                <Check size={14} /> Prieten
                              </div>
                            )}
                            {isPending && (
                              <div className="px-3 py-2.5 text-sm text-white/40 flex items-center gap-2">
                                <Clock size={14} /> Cerere trimisă
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Clasament ── */}
        {tab === 3 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-1">CLASAMENT PUNCTE</p>
            {[...members]
              .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
              .map((m, idx) => {
                const isMe = m.userId === user?.uid
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                const roleColor = ROLE_COLORS[m.role as MemberRole] ?? '#1ED75F'
                return (
                  <div
                    key={m.userId}
                    className={`flex items-center gap-3 px-3 py-3 rounded-2xl ${isMe ? 'border border-brand-green/35' : ''}`}
                    style={{ backgroundColor: isMe ? '#1ED75F0E' : 'var(--app-surface)' }}
                  >
                    <div className="w-7 text-center flex-shrink-0">
                      {medal
                        ? <span className="text-lg leading-none">{medal}</span>
                        : <span className="text-sm font-bold text-white/30">{idx + 1}</span>}
                    </div>
                    <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${roleColor}22`, border: `2px solid ${roleColor}` }}>
                      {m.photoUrl
                        ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-sm font-black" style={{ color: roleColor }}>{m.displayName.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isMe ? 'text-brand-green' : 'text-white'}`}>
                        {m.displayName}
                        {isMe && <span className="text-[9px] font-normal text-white/30 ml-1">TU</span>}
                      </p>
                      <span className="text-[10px] font-semibold" style={{ color: roleColor }}>
                        {ROLE_LABELS[m.role as MemberRole]}
                      </span>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-black text-brand-green">{m.points ?? 0}</p>
                      <p className="text-[10px] text-white/30">puncte</p>
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

// ── Training Card ─────────────────────────────────────────────────────────────

function TrainingCard({ training, myUid, canLoad, canDelete, onRsvp, onLoad, onDelete }: {
  training: PlannedTraining
  myUid: string
  canLoad: boolean
  canDelete: boolean
  onRsvp: (s: 'GOING' | 'NOT_GOING' | 'MAYBE') => void
  onLoad: () => void
  onDelete: () => void
}) {
  const myStatus = training.rsvps?.[myUid]
  const goingCount = Object.values(training.rsvps ?? {}).filter(s => s === 'GOING').length
  const maybeCount = Object.values(training.rsvps ?? {}).filter(s => s === 'MAYBE').length

  const officialStyle = training.official ? {
    backgroundColor: '#0D3D28',
    border: '1.5px solid #1ED75F60',
    boxShadow: '0 0 18px 0 #1ED75F18, inset 0 1px 0 #1ED75F20',
  } : { backgroundColor: 'var(--app-surface)' }

  return (
    <div className="rounded-2xl mb-3" style={officialStyle}>
      <div className={training.official ? 'p-5' : 'p-4'}>
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            {training.official && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest"
                  style={{ backgroundColor: '#1ED75F22', color: '#1ED75F', border: '1px solid #1ED75F40' }}>
                  ⭐ OFICIAL
                </span>
              </div>
            )}
            <p className={`font-black text-white ${training.official ? 'text-base' : 'text-sm'}`}>{training.name}</p>
            {training.authorName && (
              <p className="text-[10px] text-white/35 mt-0.5">de {training.authorName}</p>
            )}
          </div>
          {canDelete && (
            <button onClick={onDelete} className="ml-2 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5">
          {training.date && (
            <div className="flex items-center gap-1 text-xs text-white/50">
              <Calendar size={11} />
              <span>{formatTrainingDate(training.date)}</span>
            </div>
          )}
          {(training.timeStart || training.timeEnd) && (
            <div className="flex items-center gap-1 text-xs text-white/50">
              <Clock size={11} />
              <span>{training.timeStart}{training.timeEnd ? ` – ${training.timeEnd}` : ''}</span>
            </div>
          )}
          {training.location && (
            <div className="flex items-center gap-1 text-xs text-white/50">
              <MapPin size={11} />
              <span>{training.location}</span>
            </div>
          )}
        </div>

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

        {/* RSVP count */}
        <div className="flex gap-3 text-xs text-white/40 mb-2.5">
          <span>✅ {goingCount} merg</span>
          <span>🤔 {maybeCount} poate</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {(['GOING', 'MAYBE', 'NOT_GOING'] as const).map(status => (
            <button key={status}
              onClick={() => onRsvp(status)}
              className={`flex-1 h-8 rounded-lg text-xs font-bold transition-colors border ${
                myStatus === status
                  ? 'bg-brand-green text-black border-brand-green'
                  : 'border-white/15 text-white/50 hover:bg-white/8'
              }`}>
              {status === 'GOING' ? 'Merg' : status === 'MAYBE' ? 'Poate' : 'Nu merg'}
            </button>
          ))}
          {canLoad && (
            <button
              onClick={onLoad}
              className="h-8 px-3 rounded-lg text-xs font-bold bg-brand-green text-black flex items-center gap-1 flex-shrink-0"
            >
              <Dumbbell size={12} /> Încarcă
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Training Form ─────────────────────────────────────────────────────────

function AddTrainingForm({ communityId, userId, userName, isStaff, onClose }: {
  communityId: string; userId: string; userName: string; isStaff: boolean; onClose: () => void
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('20:30')
  const [location, setLocation] = useState('')
  const [official, setOfficial] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'communities', communityId, 'trainings'), {
        name: name.trim(),
        description: desc.trim(),
        date,
        timeStart: start,
        timeEnd: end,
        location: location.trim(),
        exercises: [],
        authorId: userId,
        authorName: userName,
        official,
        rsvps: userId ? { [userId]: 'GOING' } : {},
        createdAt: serverTimestamp(),
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/30" style={{ backgroundColor: 'var(--app-bg)' }}>
      <p className="text-sm font-bold text-white mb-3">Adaugă antrenament</p>
      <div className="flex flex-col gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nume *"
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descriere"
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <div className="flex gap-2">
          <input type="time" value={start} onChange={e => setStart(e.target.value)}
            className="flex-1 min-w-0 h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
          <input type="time" value={end} onChange={e => setEnd(e.target.value)}
            className="flex-1 min-w-0 h-10 rounded-xl px-3 text-sm text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        </div>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Locație"
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />

        {isStaff && (
          <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={official}
              onChange={e => setOfficial(e.target.checked)}
              className="accent-brand-green w-4 h-4"
            />
            <span>Oficial</span>
            <span className="text-xs text-white/35">(anunț oficial al comunității)</span>
          </label>
        )}

        <div className="flex gap-2 mt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-xl border border-white/15 text-sm text-white/60">
            Anulează
          </button>
          <button onClick={save} disabled={saving || !name.trim()}
            className="flex-1 h-9 rounded-xl bg-brand-green text-black text-sm font-bold disabled:opacity-40">
            {saving ? '...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Post Card (likes + comments) ──────────────────────────────────────────────

function PostCard({ post, communityId, myUid, myName, myRole, isSuperAdmin, onDelete }: {
  post: CommunityPost
  communityId: string
  myUid: string
  myName: string
  myRole: MemberRole
  isSuperAdmin: boolean
  onDelete: () => void
}) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.likesCount ?? 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'communities', communityId, 'posts', post.id, 'likes'),
      snap => {
        setLikeCount(snap.size)
        setLiked(snap.docs.some(d => d.id === myUid))
      }
    )
    return unsub
  }, [post.id, communityId, myUid])

  useEffect(() => {
    if (!showComments) return
    const q = query(
      collection(db, 'communities', communityId, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'asc')
    )
    return onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PostComment))
    })
  }, [showComments, post.id, communityId])

  async function toggleLike() {
    if (!myUid) return
    const likeRef = doc(db, 'communities', communityId, 'posts', post.id, 'likes', myUid)
    if (liked) {
      setLiked(false)
      setLikeCount(c => Math.max(0, c - 1))
      await deleteDoc(likeRef)
    } else {
      setLiked(true)
      setLikeCount(c => c + 1)
      await setDoc(likeRef, { uid: myUid, likedAt: serverTimestamp() })
    }
  }

  async function addComment() {
    if (!commentText.trim() || commenting) return
    setCommenting(true)
    try {
      await addDoc(
        collection(db, 'communities', communityId, 'posts', post.id, 'comments'),
        { authorId: myUid, authorName: myName, text: commentText.trim(), createdAt: serverTimestamp() }
      )
      setCommentText('')
    } finally { setCommenting(false) }
  }

  const roleColor = ROLE_COLORS[post.authorRole as MemberRole] ?? '#1ED75F'

  return (
    <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F22', border: `1.5px solid ${roleColor}` }}>
            <span className="text-xs font-black" style={{ color: roleColor }}>
              {post.authorName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-sm font-bold text-white">{post.authorName}</span>
            <span className="text-[10px] font-semibold ml-1.5 px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: `${roleColor}22`, color: roleColor }}>
              {ROLE_LABELS[post.authorRole as MemberRole]}
            </span>
          </div>
        </div>
        {(post.authorId === myUid || myRole === 'ADMIN' || isSuperAdmin) && (
          <button onClick={onDelete} className="text-red-400/60 hover:text-red-400 transition-colors p-1">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <p className="text-sm text-white/80 leading-relaxed mb-3">{post.content}</p>

      <div className="flex items-center gap-4">
        <button onClick={toggleLike}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${liked ? 'text-red-400' : 'text-white/40 hover:text-white/60'}`}>
          <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button onClick={() => setShowComments(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${showComments ? 'text-brand-green' : 'text-white/40 hover:text-white/60'}`}>
          <MessageCircle size={14} />
          {comments.length > 0 && <span>{comments.length}</span>}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 border-t border-white/8 pt-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-white/50">{c.authorName.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <span className="text-xs font-bold text-white">{c.authorName} </span>
                <span className="text-xs text-white/70">{c.text}</span>
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addComment()}
              placeholder="Adaugă un comentariu..."
              className="flex-1 h-8 rounded-lg px-3 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
            />
            <button onClick={addComment} disabled={commenting || !commentText.trim()}
              className="w-8 h-8 rounded-lg bg-brand-green disabled:opacity-40 flex items-center justify-center flex-shrink-0">
              <Send size={12} className="text-black" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Verify Area ───────────────────────────────────────────────────────────────

function VerifyArea({
  verifySent, verifyReqPending, showVerifyForm, verifyReason, verifySaving,
  onShowForm, onHideForm, onChangeReason, onSubmit,
}: {
  verifySent: boolean
  verifyReqPending: boolean
  showVerifyForm: boolean
  verifyReason: string
  verifySaving: boolean
  onShowForm: () => void
  onHideForm: () => void
  onChangeReason: (v: string) => void
  onSubmit: () => void
}) {
  if (verifySent) return <span className="text-[11px] text-brand-green font-semibold">Cerere trimisă ✓</span>
  if (verifyReqPending) return (
    <span className="text-[11px] px-2 py-0.5 rounded-full"
      style={{ backgroundColor: '#F9731618', color: '#F97316', border: '1px solid #F9731630' }}>
      ⏳ Verificare în așteptare...
    </span>
  )
  if (!showVerifyForm) return (
    <button
      onClick={onShowForm}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors"
    >
      Solicită verificare
    </button>
  )
  return (
    <div className="p-3 rounded-xl border border-blue-500/30" style={{ backgroundColor: '#1e3a5f22' }}>
      <p className="text-xs font-bold text-white/70 mb-1.5">De ce merită această comunitate verificarea?</p>
      <textarea
        value={verifyReason}
        onChange={e => onChangeReason(e.target.value)}
        placeholder="Descrie comunitatea și activitatea ei..."
        rows={3}
        className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 resize-none focus:border-blue-500/50"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={onHideForm}
          className="flex-1 h-8 rounded-lg border border-white/15 text-xs text-white/60">
          Anulează
        </button>
        <button onClick={onSubmit} disabled={verifySaving || !verifyReason.trim()}
          className="flex-1 h-8 rounded-lg text-xs font-bold disabled:opacity-40"
          style={{ backgroundColor: '#3B82F6', color: 'white' }}>
          {verifySaving ? '...' : 'Trimite'}
        </button>
      </div>
    </div>
  )
}
