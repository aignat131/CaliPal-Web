'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import {
  doc, collection, onSnapshot, addDoc, deleteDoc,
  updateDoc, setDoc, serverTimestamp, getDoc, query, orderBy, getDocs, where,
  increment, arrayRemove, arrayUnion, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { createNotification } from '@/lib/firebase/notifications'
import type {
  CommunityDoc, CommunityMember, CommunityPost,
  PlannedTraining, MemberRole, PostComment,
} from '@/types'
import { ROLE_LABELS, conversationId } from '@/types'
import {
  ArrowLeft, MessageSquare, Send, Trash2, Plus,
  UserPlus, Check, Clock, MapPin, Calendar, Dumbbell, Users,
  Heart, MessageCircle, MoreVertical, User, Bell, X, LogOut, UserX, Share2,
} from 'lucide-react'
import Link from 'next/link'

const SUPERADMIN = process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''

const ROLE_COLORS: Record<MemberRole, string> = {
  ADMIN: '#FFB800',
  MODERATOR: '#3B82F6',
  TRAINER: '#F97316',
  MEMBER: '#1ED75F',
}

/**
 * Parse a training datetime string.
 * Supports Android format "dd/MM/yyyy HH:mm" and ISO date "yyyy-MM-dd".
 */
function parseTrainingDateTime(str: string, fallbackDate?: string): Date | null {
  if (!str) return null
  // Android format: "dd/MM/yyyy HH:mm"
  const androidMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (androidMatch) {
    const [, dd, mm, yyyy, hh, min] = androidMatch
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}`)
  }
  // Legacy web format: timeStart is time-only "HH:mm", fallbackDate is "yyyy-MM-dd"
  if (fallbackDate && /^\d{2}:\d{2}$/.test(str)) {
    return new Date(`${fallbackDate}T${str}`)
  }
  // Try direct parse
  try { return new Date(str) } catch { return null }
}

function formatTrainingDate(timeStart: string, legacyDate?: string): string {
  const d = parseTrainingDateTime(timeStart, legacyDate)
  if (!d || isNaN(d.getTime())) return legacyDate ?? ''
  try {
    return d.toLocaleDateString('ro', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return '' }
}

/** Format "dd/MM/yyyy HH:mm" full-datetime string from a date + time inputs. */
function toAndroidDateTime(date: string, time: string): string {
  // date is "yyyy-MM-dd", time is "HH:mm"
  if (!date || !time) return ''
  const [yyyy, mm, dd] = date.split('-')
  return `${dd}/${mm}/${yyyy} ${time}`
}

export default function CommunityDetailPage() {
  const { user } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
  const { requestPermission } = usePushNotifications(user?.uid)
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
  // Three-dots community menu (leave)
  const [showCommunityMenu, setShowCommunityMenu] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Join state
  const [joining, setJoining] = useState(false)
  const [showJoinNotif, setShowJoinNotif] = useState(false)

  // Kick confirmation
  const [kickTarget, setKickTarget] = useState<CommunityMember | null>(null)
  const [kicking, setKicking] = useState(false)

  const isSuperAdmin = user?.email === SUPERADMIN

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'communities', id),
      snap => {
        if (snap.exists()) setCommunity({ id: snap.id, ...snap.data() } as CommunityDoc)
        else setCommunity(null)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return unsub
  }, [id])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'communities', id, 'members'),
      snap => {
        const list = snap.docs.map(d => d.data() as CommunityMember)
        setMembers(list)
        if (user) {
          const me = list.find(m => m.userId === user.uid)
          setIsMember(!!me)
          setMyRole((me?.role as MemberRole) ?? 'MEMBER')
        }
      },
      () => { /* permission denied — user is not a member */ }
    )
    return unsub
  }, [id, user])

  useEffect(() => {
    const q = query(collection(db, 'communities', id, 'posts'), orderBy('createdAt', 'desc'))
    return onSnapshot(q,
      snap => { setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityPost)) },
      () => { /* non-members can't read posts — silently ignore */ }
    )
  }, [id])

  useEffect(() => {
    if (!user) return
    // No orderBy — sort client-side to avoid any composite-index dependency
    return onSnapshot(collection(db, 'communities', id, 'trainings'),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setTrainings(list)
      },
      () => { /* non-members can't read trainings — silently ignore */ }
    )
  }, [id, user])

  // Load friend/pending status for member tab
  const loadSocialStatus = useCallback(async () => {
    if (!user) return
    try {
      const [friendsSnap, sentSnap] = await Promise.all([
        getDocs(collection(db, 'users', user.uid, 'friends')),
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

  // Auto-delete expired trainings (staff/superAdmin only)
  useEffect(() => {
    if (!trainings.length) return
    const canDelete = isSuperAdmin || myRole === 'ADMIN' || myRole === 'MODERATOR' || myRole === 'TRAINER'
    if (!canDelete) return
    const now = new Date()
    trainings.forEach(t => {
      if (!t.timeEnd) return
      const end = parseTrainingDateTime(t.timeEnd, t.date)
      if (end && end < now) {
        deleteDoc(doc(db, 'communities', id, 'trainings', t.id)).catch(() => {})
      }
    })
  }, [trainings, isSuperAdmin, myRole, id])

  async function joinCommunity() {
    if (!user || joining) return
    setJoining(true)
    try {
      const batch = writeBatch(db)
      batch.set(doc(db, 'communities', id, 'members', user.uid), {
        userId: user.uid,
        displayName: user.displayName ?? '',
        role: 'MEMBER',
        level: 1,
        points: 0,
        photoUrl: user.photoURL ?? null,
        joinedAt: serverTimestamp(),
      })
      batch.update(doc(db, 'communities', id), { memberCount: increment(1) })
      batch.update(doc(db, 'users', user.uid), { joinedCommunityIds: arrayUnion(id) })
      await batch.commit()
      setShowJoinNotif(true)
    } finally {
      setJoining(false)
    }
  }

  async function leaveCommunity() {
    if (!user || leaving) return
    setLeaving(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'communities', id, 'members', user.uid))
      batch.update(doc(db, 'communities', id), { memberCount: increment(-1) })
      const updates: Record<string, unknown> = { joinedCommunityIds: arrayRemove(id) }
      if (userSnap.data()?.favoriteCommunityId === id) updates.favoriteCommunityId = ''
      batch.update(userRef, updates)
      await batch.commit()
      sessionStorage.setItem('skip_community_redirect', '1')
      router.push('/community')
    } finally {
      setLeaving(false)
      setShowCommunityMenu(false)
    }
  }

  async function kickMember(member: CommunityMember) {
    if (!user || kicking) return
    setKicking(true)
    try {
      const memberUserRef = doc(db, 'users', member.userId)
      const memberUserSnap = await getDoc(memberUserRef)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'communities', id, 'members', member.userId))
      batch.update(doc(db, 'communities', id), { memberCount: increment(-1) })
      const updates: Record<string, unknown> = { joinedCommunityIds: arrayRemove(id) }
      if (memberUserSnap.data()?.favoriteCommunityId === id) updates.favoriteCommunityId = ''
      batch.update(memberUserRef, updates)
      await batch.commit()
      await createNotification(
        member.userId,
        'COMMUNITY_REMOVED',
        'Ai fost eliminat din comunitate',
        `Ne pare rău, dar ai fost eliminat din "${community?.name ?? 'comunitate'}". Poți explora alte comunități.`,
        id,
      )
    } finally {
      setKicking(false)
      setKickTarget(null)
      setOpenMenuId(null)
    }
  }

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
      // Silently ignore
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!community) return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6 text-center" style={{ backgroundColor: 'var(--app-bg)' }}>
      <p className="text-4xl mb-4">🏚️</p>
      <p className="text-base font-bold text-white mb-1">Comunitate negăsită</p>
      <p className="text-sm text-white/50 mb-6">Această comunitate nu există sau a fost ștearsă.</p>
      <button onClick={() => router.replace('/community')}
        className="h-11 px-6 rounded-2xl bg-brand-green text-black text-sm font-bold">
        Înapoi la comunități
      </button>
    </div>
  )

  const sortedMembers = [...members].sort((a, b) => {
    const order = ['ADMIN', 'MODERATOR', 'TRAINER', 'MEMBER']
    return order.indexOf(a.role) - order.indexOf(b.role)
  })

  // Tabs available to non-members: only Membri
  const visibleTabs = isMember
    ? [
        { label: 'Feed', Icon: MessageSquare },
        { label: 'Antrenamente', Icon: Dumbbell },
        { label: 'Membri', Icon: Users },
      ]
    : [{ label: 'Membri', Icon: Users }]

  // For non-members, always show tab index 0 (Membri)
  const effectiveTab = isMember ? tab : 2

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Kick confirmation dialog */}
      {kickTarget && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 px-6"
          onClick={() => setKickTarget(null)}>
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: 'var(--app-surface)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-2 mb-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
                style={{ backgroundColor: '#EF444418' }}>
                <UserX size={22} className="text-red-400" />
              </div>
              <p className="font-black text-white text-base">Elimini {kickTarget.displayName}?</p>
              <p className="text-sm text-white/50 leading-relaxed">
                Utilizatorul va fi eliminat din comunitate și va primi o notificare.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setKickTarget(null)}
                className="flex-1 h-11 rounded-2xl border border-white/15 text-sm text-white/60 font-semibold">
                Anulează
              </button>
              <button
                onClick={() => kickMember(kickTarget)}
                disabled={kicking}
                className="flex-1 h-11 rounded-2xl text-sm font-black text-white disabled:opacity-50"
                style={{ backgroundColor: '#EF4444' }}
              >
                {kicking ? '...' : 'Elimină'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Notification Modal */}
      {showJoinNotif && community && (
        <JoinNotificationModal
          communityName={community.name}
          onRequestNotifications={async () => {
            await requestPermission()
            setShowJoinNotif(false)
          }}
          onDismiss={() => setShowJoinNotif(false)}
        />
      )}

      {/* Header */}
      <div className="max-w-lg mx-auto">
      {community?.imageUrl ? (
        /* ── Cover image header ── */
        <div className="border-b border-white/8">
          <div className="relative overflow-hidden" style={{ height: 140 }}>
            <Image src={community.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" />
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, var(--app-bg) 100%)' }} />
            <button
              onClick={() => { sessionStorage.setItem('skip_community_redirect', '1'); router.push('/community') }}
              className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            {/* Three-dots menu (members only) */}
            {isMember && (
              <div className="absolute top-3 right-3">
                <button
                  onClick={() => setShowCommunityMenu(v => !v)}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                >
                  <MoreVertical size={18} className="text-white" />
                </button>
                {showCommunityMenu && (
                  <div
                    className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[180px]"
                    style={{ backgroundColor: 'var(--app-bg)' }}
                  >
                    <button
                      onClick={leaveCommunity}
                      disabled={leaving}
                      className="w-full px-4 py-3 text-sm text-red-400 hover:bg-white/8 flex items-center gap-2 text-left disabled:opacity-50"
                    >
                      <LogOut size={14} /> {leaving ? '...' : 'Ieși din comunitate'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {community.verified && (
              <span className="absolute top-3 right-12 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(59,130,246,0.3)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }}>
                ✓ Verificat
              </span>
            )}
            <div className="absolute bottom-3 left-4 right-4">
              <p className="font-black text-white text-base leading-tight drop-shadow">{community.name}</p>
              <p className="text-xs text-white/65">{community.memberCount ?? 0} membri · {isMember ? 'Membru' : 'Vizitator'}</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Plain text header (no image) ── */
        <div className="px-4 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-center gap-3">
            <button onClick={() => { sessionStorage.setItem('skip_community_redirect', '1'); router.push('/community') }} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
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
            {/* Three-dots menu (members only) */}
            {isMember && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowCommunityMenu(v => !v)}
                  className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center"
                >
                  <MoreVertical size={18} className="text-white/70" />
                </button>
                {showCommunityMenu && (
                  <div
                    className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[180px]"
                    style={{ backgroundColor: 'var(--app-bg)' }}
                  >
                    <button
                      onClick={leaveCommunity}
                      disabled={leaving}
                      className="w-full px-4 py-3 text-sm text-red-400 hover:bg-white/8 flex items-center gap-2 text-left disabled:opacity-50"
                    >
                      <LogOut size={14} /> {leaving ? '...' : 'Ieși din comunitate'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Non-member join banner */}
      {!isMember && !loading && (
        <div className="mx-4 mt-3 mb-1 rounded-2xl p-4 flex items-center gap-3 border border-brand-green/25"
          style={{ backgroundColor: '#1ED75F0A' }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">
              {user ? 'Ești vizitator' : 'Autentifică-te pentru a te alătura'}
            </p>
            <p className="text-xs text-white/50 mt-0.5">
              {user ? 'Intră în comunitate pentru a accesa antrenamentele și feed-ul.' : 'Creează un cont sau intră în cont pentru acces complet.'}
            </p>
          </div>
          {user ? (
            <button
              onClick={joinCommunity}
              disabled={joining}
              className="h-9 px-4 rounded-xl bg-brand-green text-black text-sm font-black flex-shrink-0 disabled:opacity-50"
            >
              {joining ? '...' : 'Intru'}
            </button>
          ) : (
            <div className="flex gap-2 flex-shrink-0">
              <Link href="/login">
                <span className="h-9 px-3 rounded-xl border border-white/20 text-xs font-bold text-white flex items-center">Cont</span>
              </Link>
              <Link href="/register">
                <span className="h-9 px-4 rounded-xl bg-brand-green text-black text-xs font-black flex items-center">Înscrie-te</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tabs — non-members only see Membri */}
      <div className="max-w-lg mx-auto">
      <div className="flex border-b border-white/10 mt-3">
        {visibleTabs.map(({ label, Icon }, i) => {
          // For members: tab index matches. For non-members: only 1 tab (index 0 = Membri)
          const tabIndex = isMember ? i : 2
          const isActive = isMember ? tab === i : true
          return (
            <button key={label} onClick={() => isMember && setTab(tabIndex)}
              className={`flex-1 py-3 text-xs font-bold transition-colors flex flex-col items-center gap-0.5 ${
                isActive ? 'text-brand-green border-b-2 border-brand-green' : 'text-white/40'
              }`}>
              <Icon size={15} />
              {label}
            </button>
          )
        })}
      </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">

        {/* ── Feed ── */}
        {effectiveTab === 0 && (
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
        {effectiveTab === 1 && (
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
                defaultLocation={community?.location ?? ''}
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
                    return (a.timeStart ?? a.date ?? '').localeCompare(b.timeStart ?? b.date ?? '')
                  })
                  .map(t => (
                <TrainingCard
                  key={t.id}
                  training={t}
                  communityId={id}
                  myUid={user?.uid ?? ''}
                  members={members}
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
        {effectiveTab === 2 && (!user ? (
          <div className="text-center py-14">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#1ED75F18' }}>
              <Users size={24} className="text-brand-green" />
            </div>
            <p className="font-black text-white mb-1">Vezi membrii comunității</p>
            <p className="text-sm text-white/50 mb-5">Autentifică-te pentru a vedea membrii</p>
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              <Link href="/register">
                <span className="h-11 rounded-2xl bg-brand-green text-black text-sm font-black flex items-center justify-center">Creează cont</span>
              </Link>
              <Link href="/login">
                <span className="h-11 rounded-2xl border border-white/15 text-white text-sm font-semibold flex items-center justify-center">Intră în cont</span>
              </Link>
            </div>
          </div>
        ) : (
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
                    <div className="relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: `${roleColor}22`, border: `2px solid ${roleColor}` }}>
                      {m.photoUrl
                        ? <Image src={m.photoUrl} alt={m.displayName} fill sizes="40px" className="object-cover" />
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

                  {/* Three-dots menu (right side) — only for members */}
                  {isMember && (
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
                              {/* Kick — admin only, not for other admins */}
                              {(isSuperAdmin || myRole === 'ADMIN') && m.role !== 'ADMIN' && (
                                <button
                                  onClick={() => { setKickTarget(m); setOpenMenuId(null) }}
                                  className="w-full px-3 py-2.5 text-sm text-red-400 hover:bg-red-400/10 flex items-center gap-2 text-left border-t border-white/8"
                                >
                                  <UserX size={14} /> Elimină din comunitate
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

      </div>
    </div>
  )
}

// ── Join Notification Modal ───────────────────────────────────────────────────

function JoinNotificationModal({
  communityName, onRequestNotifications, onDismiss,
}: {
  communityName: string
  onRequestNotifications: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60" onClick={onDismiss}>
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-end mb-1">
          <button onClick={onDismiss} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F30' }}>
            <Bell size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">Ai intrat în {communityName}!</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">
              Vrei să primești notificări despre antrenamente și noutăți din această comunitate?
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onRequestNotifications}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm"
          >
            Da, activează notificările
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-2xl text-white/45 text-sm font-semibold"
          >
            Nu, mulțumesc
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Training Card ─────────────────────────────────────────────────────────────

function MemberAvatar({ photoUrl, name, size = 28 }: { photoUrl?: string | null; name: string; size?: number }) {
  const initials = name.trim().charAt(0).toUpperCase()
  return (
    <div
      className="rounded-full border-2 overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/20"
      style={{ width: size, height: size, borderColor: 'var(--app-surface)' }}
    >
      {photoUrl
        ? <Image src={photoUrl} alt={name} width={size} height={size} className="object-cover" />
        : <span className="text-white font-bold" style={{ fontSize: size * 0.38 }}>{initials}</span>}
    </div>
  )
}

function TrainingCard({ training, communityId, myUid, members, canLoad, canDelete, onRsvp, onLoad, onDelete }: {
  training: PlannedTraining
  communityId: string
  myUid: string
  members: CommunityMember[]
  canLoad: boolean
  canDelete: boolean
  onRsvp: (s: 'GOING' | 'NOT_GOING' | 'MAYBE') => void
  onLoad: () => void
  onDelete: () => void
}) {
  const [showAllGoing, setShowAllGoing] = useState(false)

  const myStatus = training.rsvps?.[myUid]
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
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            <button
              onClick={handleShare}
              title="Distribuie pe WhatsApp"
              className="w-8 h-8 flex items-center justify-center rounded-full text-brand-green/60 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
            >
              <Share2 size={14} />
            </button>
            {canDelete && (
              <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center rounded-full text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5">
          {(training.timeStart || training.date) && (
            <div className="flex items-center gap-1 text-xs text-white/50">
              <Calendar size={11} />
              <span>{formatTrainingDate(training.timeStart, training.date)}</span>
            </div>
          )}
          {(training.timeStart || training.timeEnd) && (
            <div className="flex items-center gap-1 text-xs text-white/50">
              <Clock size={11} />
              <span>
                {training.timeStart?.slice(-5)}
                {training.timeEnd ? ` – ${training.timeEnd.slice(-5)}` : ''}
              </span>
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
                {guestGoing.map((g, i) => (
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
            <button onClick={onLoad} className="h-8 px-3 rounded-lg text-xs font-bold bg-brand-green text-black flex items-center gap-1 flex-shrink-0">
              <Dumbbell size={12} /> Încarcă
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Add Training Form ─────────────────────────────────────────────────────────

function AddTrainingForm({ communityId, userId, userName, isStaff, defaultLocation, onClose }: {
  communityId: string; userId: string; userName: string; isStaff: boolean; defaultLocation?: string; onClose: () => void
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('20:30')
  const [location, setLocation] = useState(defaultLocation ?? '')
  const [official, setOfficial] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'communities', communityId, 'trainings'), {
        name:            name.trim(),
        description:     desc.trim(),
        timeStart:       toAndroidDateTime(date, start),
        timeEnd:         toAndroidDateTime(date, end),
        location:        location.trim(),
        authorId:        userId,
        authorName:      userName,
        authorCoach:     isStaff,
        authorAdmin:     false,
        official,
        reminderMinutes: 30,
        rsvps:           userId ? { [userId]: 'GOING' } : {},
        createdAt:       serverTimestamp(),
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

  const isOwnPost = post.authorId === myUid

  async function toggleLike() {
    if (!myUid || isOwnPost) return
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
      await updateDoc(doc(db, 'communities', communityId, 'posts', post.id), { commentsCount: increment(1) })
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

      <p className="text-sm text-white/80 leading-relaxed mb-3 whitespace-pre-line">{post.content}</p>

      {post.photoUrl && (
        <div className="mb-3 rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.photoUrl} alt="" className="w-full object-cover max-h-72" />
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={isOwnPost ? undefined : toggleLike}
          disabled={isOwnPost}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
            isOwnPost ? 'text-white/20 cursor-default' : liked ? 'text-red-400' : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Heart size={14} fill={liked && !isOwnPost ? 'currentColor' : 'none'} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button onClick={() => setShowComments(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${showComments ? 'text-brand-green' : 'text-white/40 hover:text-white/60'}`}>
          <MessageCircle size={14} />
          {(showComments ? comments.length : (post.commentsCount ?? 0)) > 0 && (
            <span>{showComments ? comments.length : post.commentsCount}</span>
          )}
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

// ── Guest Avatar (for guest RSVPs — gray silhouette icon) ─────────────────────

function GuestAvatar({ size = 28 }: { name?: string; size?: number }) {
  return (
    <div
      className="rounded-full border-2 overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{
        width: size, height: size,
        borderColor: 'var(--app-surface)',
        backgroundColor: 'rgba(255,255,255,0.12)',
      }}
    >
      <User size={size * 0.45} className="text-white/50" />
    </div>
  )
}
