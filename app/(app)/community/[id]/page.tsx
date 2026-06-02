'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import {
  doc, collection, onSnapshot, addDoc, deleteDoc,
  updateDoc, setDoc, serverTimestamp, getDoc, query, orderBy, getDocs, where,
  increment, arrayRemove, arrayUnion, writeBatch, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { uploadCommunityPhoto, uploadPostPhoto } from '@/lib/firebase/storage'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { createNotification } from '@/lib/firebase/notifications'
import { awardCoins } from '@/lib/gamification/coins'
import type {
  CommunityDoc, CommunityMember, CommunityPost,
  PlannedTraining, MemberRole, PostComment,
} from '@/types'
import { ROLE_LABELS, conversationId } from '@/types'
import {
  ArrowLeft, MessageSquare, Send, Trash2, Plus,
  UserPlus, Check, Clock, MapPin, Calendar, Dumbbell, Users,
  MessageCircle, User, Bell, X, LogOut, UserX, Share2,
  Pencil, Camera, Info, Mail, MailX, History, ImagePlus,
  ChevronRight, ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/context/LanguageContext'
import { useToast } from '@/lib/context/ToastContext'
import { SkeletonCard, SkeletonTrainingRow } from '@/components/ui/SkeletonLoaders'
import { GroupChatTab } from '@/components/community/GroupChatTab'

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
  const { displayName: myName, photoUrl: myPhoto, profile: myProfile } = useMyProfile()
  const { requestPermission } = usePushNotifications(user?.uid)
  const t = useT()
  const { showToast } = useToast()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [community, setCommunity] = useState<CommunityDoc | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [trainings, setTrainings] = useState<PlannedTraining[]>([])
  const [isMember, setIsMember] = useState(false)
  const [myRole, setMyRole] = useState<MemberRole>('MEMBER')
  const [myEmailNotifications, setMyEmailNotifications] = useState(true)
  const [tab, setTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(`comm_detail_tab_${params.id}`)
      if (saved !== null) return parseInt(saved)
    }
    return 2 // default: Membri
  })
  const [loading, setLoading] = useState(true)
  const [postText, setPostText] = useState('')
  const [postImage, setPostImage] = useState<File | null>(null)
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null)
  const postImageRef = useRef<HTMLInputElement>(null)
  const [posting, setPosting] = useState(false)
  const [showAddTraining, setShowAddTraining] = useState(false)
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // Three-dots community menu (leave)
  const [showCommunityMenu, setShowCommunityMenu] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Join state
  const [joining, setJoining] = useState(false)
  const [showJoinNotif, setShowJoinNotif] = useState(false)
  const [showCommNotifPrompt, setShowCommNotifPrompt] = useState(false)

  // Tab content loading
  const [postsLoaded, setPostsLoaded] = useState(false)
  const [trainingsLoaded, setTrainingsLoaded] = useState(false)

  // Kick confirmation
  const [kickTarget, setKickTarget] = useState<CommunityMember | null>(null)
  const [kicking, setKicking] = useState(false)
  const kickDialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(kickDialogRef, !!kickTarget)

  // Community edit
  const [showEditCommunity, setShowEditCommunity] = useState(false)

  // Member sheet
  const [memberSheetTarget, setMemberSheetTarget] = useState<CommunityMember | null>(null)

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
          setMyEmailNotifications(me?.emailNotifications !== false)
        }
      },
      () => { /* permission denied — user is not a member */ }
    )
    return unsub
  }, [id, user])

  // Show community notification prompt the first time a member visits this community
  useEffect(() => {
    if (!isMember || !community || !user || showJoinNotif) return
    if (!localStorage.getItem(`calipal_comm_notif_asked_${id}`)) {
      setShowCommNotifPrompt(true)
    }
  }, [isMember, community?.id, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = query(collection(db, 'communities', id, 'posts'), orderBy('createdAt', 'desc'), limit(30))
    return onSnapshot(q,
      snap => { setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CommunityPost)); setPostsLoaded(true) },
      () => { setPostsLoaded(true) /* non-members can't read posts — silently ignore */ }
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
        setTrainingsLoaded(true)
      },
      () => { setTrainingsLoaded(true) /* non-members can't read trainings — silently ignore */ }
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
    if (tab === 3) loadSocialStatus()
  }, [tab, id, loadSocialStatus])


  function dismissCommNotifPrompt() {
    localStorage.setItem(`calipal_comm_notif_asked_${id}`, '1')
    setShowCommNotifPrompt(false)
  }

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
      awardCoins(user.uid, 'JOIN_COMMUNITY').catch(() => {})
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

  async function toggleEmailNotifications() {
    if (!user) return
    const newVal = !myEmailNotifications
    setMyEmailNotifications(newVal)
    await updateDoc(doc(db, 'communities', id, 'members', user.uid), { emailNotifications: newVal })
    setShowCommunityMenu(false)
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
      showToast(`${member.displayName} a fost eliminat.`)
    } catch {
      showToast('Eroare la eliminare.', 'error')
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
      const docRef = await addDoc(collection(db, 'communities', id, 'posts'), {
        authorId: user.uid,
        authorName: myName,
        authorRole: myRole,
        ...(myPhoto && { authorPhotoUrl: myPhoto }),
        content: postText.trim(),
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      })
      if (postImage) {
        try {
          const photoUrl = await uploadPostPhoto(id, docRef.id, postImage)
          await updateDoc(docRef, { photoUrl })
        } catch { /* non-critical — post created without image */ }
      }
      setPostText('')
      setPostImage(null)
      setPostImagePreview(null)
      showToast('Post publicat!')
    } catch {
      showToast('Eroare la publicare. Încearcă din nou.', 'error')
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

  function shareCommunity() {
    const url = `${window.location.origin}/community/${id}`
    const text = `Alătură-te comunității *${community?.name ?? ''}* pe CaliPal!\n${url}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: community?.name ?? 'Comunitate CaliPal', url }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
      })
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  function goToChat(otherUid: string, otherName: string) {
    if (!user) return
    const convId = conversationId(user.uid, otherUid)
    router.push(`/chat/${convId}?otherUserId=${otherUid}&otherName=${encodeURIComponent(otherName)}`)
  }

  async function sendFriendRequest(toMember: CommunityMember) {
    if (!user) return
    const reqId = `${user.uid}_${toMember.userId}`
    setPendingIds(prev => new Set(prev).add(toMember.userId))
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
      showToast('Cerere de prietenie trimisă!')
    } catch {
      setPendingIds(prev => { const n = new Set(prev); n.delete(toMember.userId); return n })
      showToast('Eroare la trimiterea cererii.', 'error')
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
        { label: 'Chat', Icon: MessageCircle },
        { label: 'Antrenamente', Icon: Dumbbell },
        { label: 'Membri', Icon: Users },
      ]
    : [{ label: 'Membri', Icon: Users }]

  // For non-members, always show tab index 0 (Membri → effectiveTab 3)
  const effectiveTab = isMember ? tab : 3

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Community edit modal (admin only) */}
      {showEditCommunity && community && (
        <EditCommunityModal
          community={community}
          onClose={() => setShowEditCommunity(false)}
        />
      )}

      {/* Kick confirmation dialog */}
      {kickTarget && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 px-6"
          onClick={() => setKickTarget(null)}>
          <div
            ref={kickDialogRef}
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
            localStorage.setItem(`calipal_comm_notif_asked_${id}`, '1')
          }}
          onDismiss={() => {
            setShowJoinNotif(false)
            localStorage.setItem(`calipal_comm_notif_asked_${id}`, '1')
          }}
        />
      )}

      {showCommNotifPrompt && community && (
        <JoinNotificationModal
          communityName={community.name}
          onRequestNotifications={async () => {
            await requestPermission()
            dismissCommNotifPrompt()
          }}
          onDismiss={dismissCommNotifPrompt}
        />
      )}

      {/* Header */}
      <div className="max-w-lg mx-auto">
      {community?.imageUrl ? (
        /* ── Cover image header (full-bleed, frosted glass overlay) ── */
        <div>
          <div className="relative overflow-hidden" style={{ height: 208 }}>
            <Image src={community.imageUrl} alt={`${community.name} cover photo`} fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" />
            {/* Gradients: darken top for controls, fade to bg at bottom */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 40%, rgba(13,27,26,0.9) 80%, var(--app-bg) 100%)' }} />
            {/* Back button */}
            <button
              aria-label="Înapoi"
              onClick={() => { sessionStorage.setItem('skip_community_redirect', '1'); router.push('/community') }}
              className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            {/* Right controls row */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                aria-label="Distribuie comunitatea"
                onClick={shareCommunity}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Share2 size={16} className="text-white" />
              </button>
              {isMember && (
                <div className="relative">
                  <button
                    onClick={() => setShowCommunityMenu(v => !v)}
                    aria-label="Opțiuni comunitate"
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <Pencil size={15} className="text-white" />
                  </button>
                  {showCommunityMenu && (
                    <div className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[200px]" style={{ backgroundColor: 'var(--app-bg)' }}>
                      <button onClick={() => { setShowDescription(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Info size={14} /> Descriere</button>
                      {(isSuperAdmin || myRole === 'ADMIN') && (
                        <button onClick={() => { setShowEditCommunity(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Pencil size={14} /> Editează</button>
                      )}
                      <button onClick={toggleEmailNotifications} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left">
                        {myEmailNotifications ? <MailX size={14} /> : <Mail size={14} />}
                        {myEmailNotifications ? 'Dezactivează emailuri' : 'Activează emailuri'}
                      </button>
                      <button onClick={leaveCommunity} disabled={leaving} className="w-full px-4 py-3 text-sm text-red-400 hover:bg-white/8 flex items-center gap-2 text-left disabled:opacity-50">
                        <LogOut size={14} /> {leaving ? '...' : 'Ieși din comunitate'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Frosted glass name/info strip */}
            <div className="absolute bottom-3 left-4 right-4 rounded-2xl px-4 py-3"
              style={{ backgroundColor: 'rgba(13,27,26,0.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <div className="flex items-center gap-2">
                <p className="text-base font-black text-white flex-1 truncate leading-tight">{community.name}</p>
                {community.verified && <ShieldCheck size={15} className="text-brand-green flex-shrink-0" />}
              </div>
              <p className="text-xs text-white/50 mt-0.5">{community.memberCount ?? 0} membri · {community.location ?? ''}</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Plain text header (no image) ── */
        <div className="px-4 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-center gap-3">
            <button aria-label="Înapoi" onClick={() => { sessionStorage.setItem('skip_community_redirect', '1'); router.push('/community') }} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ArrowLeft size={18} className="text-white/80" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-white text-base truncate">{community?.name ?? '...'}</p>
                {community?.verified && <ShieldCheck size={14} className="text-brand-green flex-shrink-0" />}
              </div>
              <p className="text-xs text-white/45">{community?.memberCount ?? 0} membri · {isMember ? 'Membru' : 'Vizitator'}</p>
            </div>
            <button aria-label="Distribuie" onClick={shareCommunity} className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <Share2 size={16} className="text-white/70" />
            </button>
            {isMember && (
              <div className="relative flex-shrink-0">
                <button onClick={() => setShowCommunityMenu(v => !v)} aria-label="Opțiuni comunitate" className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
                  <Pencil size={15} className="text-white/70" />
                </button>
                {showCommunityMenu && (
                  <div className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[200px]" style={{ backgroundColor: 'var(--app-bg)' }}>
                    <button onClick={() => { setShowDescription(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Info size={14} /> Descriere</button>
                    {(isSuperAdmin || myRole === 'ADMIN') && (
                      <button onClick={() => { setShowEditCommunity(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Pencil size={14} /> Editează</button>
                    )}
                    <button onClick={toggleEmailNotifications} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left">
                      {myEmailNotifications ? <MailX size={14} /> : <Mail size={14} />}
                      {myEmailNotifications ? 'Dezactivează emailuri' : 'Activează emailuri'}
                    </button>
                    <button onClick={leaveCommunity} disabled={leaving} className="w-full px-4 py-3 text-sm text-red-400 hover:bg-white/8 flex items-center gap-2 text-left disabled:opacity-50">
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

      {/* Active training banner */}
      {isMember && (() => {
        const now = Date.now()
        const active = trainings.find(t => {
          const start = parseTrainingDateTime(t.timeStart, t.date)
          const end = t.timeEnd ? parseTrainingDateTime(t.timeEnd, t.date) : null
          return start && end && now >= start.getTime() && now <= end.getTime()
        })
        return active ? (
          <div className="max-w-lg mx-auto px-4 pt-3">
            <div className="px-4 py-2.5 rounded-2xl flex items-center gap-3"
              style={{ backgroundColor: '#1ED75F12', border: '1px solid #1ED75F35' }}>
              <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold text-brand-green flex-1 min-w-0 truncate">{active.name} — în desfășurare acum</span>
              <button onClick={() => setTab(2)} className="text-xs font-black text-brand-green/70 flex-shrink-0">Vezi →</button>
            </div>
          </div>
        ) : null
      })()}

      {/* Tabs — non-members only see Membri */}
      <div className="max-w-lg mx-auto">
      <div className="flex border-b border-white/10 mt-3 sticky top-0 z-20" style={{ backgroundColor: 'var(--app-bg)' }}>
        {visibleTabs.map(({ label, Icon }, i) => {
          const tabIndex = isMember ? i : 2
          const isActive = isMember ? tab === i : true
          return (
            <button key={label} onClick={() => isMember && setTab(tabIndex)}
              className={`flex-1 py-3 text-xs font-bold transition-colors relative flex flex-col items-center gap-0.5 ${
                isActive ? 'text-brand-green' : 'text-white/40'
              }`}>
              <Icon size={15} />
              {label}
              {isActive && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-brand-green" />}
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
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    value={postText}
                    onChange={e => setPostText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addPost()}
                    placeholder="Scrie ceva..."
                    maxLength={2000}
                    className="flex-1 h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 transition-colors"
                  />
                  <input ref={postImageRef} type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setPostImage(f)
                      setPostImagePreview(URL.createObjectURL(f))
                    }}
                  />
                  <button onClick={() => postImageRef.current?.click()}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors ${postImage ? 'border-brand-green bg-brand-green/15 text-brand-green' : 'border-white/12 bg-white/7 text-white/40 hover:text-white/70'}`}>
                    <ImagePlus size={15} />
                  </button>
                  <button onClick={addPost} disabled={posting || !postText.trim()}
                    className="w-11 h-11 rounded-xl bg-brand-green disabled:opacity-40 flex items-center justify-center">
                    <Send size={15} className="text-black" />
                  </button>
                </div>
                {postImagePreview && (
                  <div className="relative mt-2 rounded-xl overflow-hidden" style={{ maxHeight: 160 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={postImagePreview} alt="" className="w-full object-cover" style={{ maxHeight: 160 }} />
                    <button onClick={() => { setPostImage(null); setPostImagePreview(null) }}
                      aria-label="Elimină imaginea"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {!postsLoaded
              ? <div className="flex flex-col gap-3">{[0,1,2].map(i => <SkeletonCard key={i} />)}</div>
              : posts.length === 0
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
                  myProTitle={myProfile?.proTitle}
                  onDelete={() => deletePost(p.id)}
                />
              ))}
          </div>
        )}

        {/* ── Chat ── */}
        {effectiveTab === 1 && community && user && (
          <GroupChatTab
            communityId={id}
            myUid={user.uid}
            myName={myProfile?.displayName || user.displayName || ''}
            myPhotoUrl={myProfile?.photoUrl || user.photoURL || null}
            myRole={myRole}
            members={members}
            onMemberTap={(m) => setMemberSheetTarget(m)}
          />
        )}

        {/* ── Antrenamente ── */}
        {effectiveTab === 2 && (
          <div>
            {isMember && (
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
                isAdmin={myRole === 'ADMIN' || isSuperAdmin}
                defaultLocation={community?.location ?? ''}
                firebaseUser={user ?? null}
                onClose={() => setShowAddTraining(false)}
              />
            )}
            {!trainingsLoaded
              ? <div className="flex flex-col gap-3">{[0,1,2].map(i => <SkeletonTrainingRow key={i} />)}</div>
              : trainings.length === 0
              ? (
                <div className="text-center py-12">
                  <Dumbbell size={36} className="text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/35">Niciun antrenament planificat.</p>
                </div>
              )
              : [...trainings]
                  .filter(t => {
                    if (!t.timeEnd) return true
                    const end = parseTrainingDateTime(t.timeEnd, t.date)
                    return !end || end >= new Date()
                  })
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
                  canDelete={isSuperAdmin || myRole === 'ADMIN' || myRole === 'MODERATOR' || myRole === 'TRAINER' || t.authorId === user?.uid}
                  canEdit={t.authorId === user?.uid}
                  onRsvp={status => rsvp(t.id, status)}
                  onLoad={() => loadTraining(t)}
                  onDelete={() => deleteDoc(doc(db, 'communities', id, 'trainings', t.id))}
                  onEdit={fields => updateDoc(doc(db, 'communities', id, 'trainings', t.id), fields)}
                />
              ))}

            {/* History link */}
            <Link href={`/training/${id}/history`}
              className="flex items-center justify-center gap-2 mt-4 py-3 rounded-2xl border border-white/10 text-sm text-white/40 hover:text-white/60 transition-colors"
              style={{ backgroundColor: 'var(--app-surface)' }}>
              <History size={14} />
              Istoric antrenamente
            </Link>
          </div>
        )}

        {/* ── Membri ── */}
        {effectiveTab === 3 && (!user ? (
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
              const livePhoto = m.photoUrl || ''

              return (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 px-3 py-3 rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
                  style={{ backgroundColor: 'var(--app-surface)' }}
                  onClick={() => setMemberSheetTarget(m)}
                >
                  {/* Avatar with role ring */}
                  <div className="relative flex-shrink-0">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: `${roleColor}22`, border: `2px solid ${roleColor}` }}>
                      {livePhoto
                        ? <Image src={livePhoto} alt={m.displayName} fill sizes="40px" className="object-cover" />
                        : <span className="text-sm font-black" style={{ color: roleColor }}>{m.displayName.charAt(0).toUpperCase()}</span>}
                    </div>
                    {m.role === 'ADMIN' && <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">👑</span>}
                    {m.role === 'TRAINER' && <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">🏋️</span>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white truncate">{m.displayName}</span>
                      {isMe && <span className="text-[9px] font-bold text-white/25">TU</span>}
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: `${roleColor}18`, color: roleColor }}>
                      {isMe && myProfile?.proTitle ? '🎯 Pro' : ROLE_LABELS[m.role as MemberRole]}
                    </span>
                  </div>

                  {/* Points */}
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="text-sm font-black text-brand-green">{m.points ?? 0}</span>
                    <span className="text-[9px] text-white/25">pts</span>
                  </div>

                  {/* Chevron hint */}
                  <ChevronRight size={14} className="text-white/15 flex-shrink-0" />
                </div>
              )
            })}
          </div>
        ))}


      </div>

      {/* Member sheet */}
      {memberSheetTarget && (
        <MemberSheet
          member={memberSheetTarget}
          myUid={user?.uid ?? ''}
          isFriend={friendIds.has(memberSheetTarget.userId)}
          isPending={pendingIds.has(memberSheetTarget.userId)}
          canKick={(isSuperAdmin || myRole === 'ADMIN') && memberSheetTarget.role !== 'ADMIN'}
          onClose={() => setMemberSheetTarget(null)}
          onGoToChat={() => { goToChat(memberSheetTarget.userId, memberSheetTarget.displayName); setMemberSheetTarget(null) }}
          onAddFriend={() => { sendFriendRequest(memberSheetTarget); setMemberSheetTarget(null) }}
          onKick={() => { setKickTarget(memberSheetTarget); setMemberSheetTarget(null) }}
        />
      )}

      {/* Description bottom sheet */}
      {showDescription && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowDescription(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: 'var(--app-bg)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <p className="text-xs font-bold text-white/30 tracking-widest mb-3">DESCRIERE</p>
            {community?.description ? (
              <p className="text-sm text-white/75 leading-relaxed whitespace-pre-line">{community.description}</p>
            ) : (
              <div>
                <p className="text-sm text-white/40 leading-relaxed mb-3">
                  Nicio descriere adăugată încă.
                </p>
                {(isSuperAdmin || myRole === 'ADMIN') && (
                  <p className="text-xs text-brand-green/70">
                    Adaugă o descriere din &ldquo;Editează comunitatea&rdquo; pentru a informa membrii despre
                    regulile, nivelul și programul comunității.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60" onClick={onDismiss}>
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-t-3xl p-6 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-end mb-1">
          <button onClick={onDismiss} aria-label="Închide" className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F30' }}>
            <Bell size={24} className="text-brand-green" />
          </div>
          <div>
            <p className="font-black text-white text-base">{t('community.joined_title', { name: communityName })}</p>
            <p className="text-sm text-white/55 mt-1.5 leading-relaxed">{t('community.joined_notif')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onRequestNotifications}
            className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm"
          >
            {t('community.enable_notif')}
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-2xl text-white/45 text-sm font-semibold"
          >
            {t('community.no_thanks')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Member Sheet ─────────────────────────────────────────────────────────────

function MemberSheet({
  member, myUid, isFriend, isPending, canKick,
  onClose, onGoToChat, onAddFriend, onKick,
}: {
  member: CommunityMember
  myUid: string
  isFriend: boolean
  isPending: boolean
  canKick: boolean
  onClose: () => void
  onGoToChat: () => void
  onAddFriend: () => void
  onKick: () => void
}) {
  const roleColor = ROLE_COLORS[member.role as MemberRole] ?? '#1ED75F'
  const isMe = member.userId === myUid

  const joinedAtMs = member.joinedAt
    ? ((member.joinedAt as { toMillis?: () => number }).toMillis?.() ?? Date.now())
    : null
  const daysSinceJoin = joinedAtMs !== null
    ? Math.floor((Date.now() - joinedAtMs) / 86400000)
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-10 animate-slide-up"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-5" />

        {/* Avatar + name row */}
        <div className="flex flex-col items-center px-6 mb-6">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: `${roleColor}22`, border: `2.5px solid ${roleColor}` }}>
              {member.photoUrl
                ? <Image src={member.photoUrl} alt={member.displayName} width={64} height={64} className="object-cover w-full h-full" />
                : <span className="text-2xl font-black" style={{ color: roleColor }}>{member.displayName.charAt(0).toUpperCase()}</span>}
            </div>
            {member.role === 'ADMIN' && <span className="absolute -bottom-0.5 -right-0.5 text-base">👑</span>}
            {member.role === 'TRAINER' && <span className="absolute -bottom-0.5 -right-0.5 text-base">🏋️</span>}
          </div>
          <p className="text-lg font-black text-white">{member.displayName}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap justify-center">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
              style={{ backgroundColor: `${roleColor}20`, color: roleColor }}>
              {ROLE_LABELS[member.role as MemberRole]}
            </span>
            <span className="text-xs text-white/35">•</span>
            <span className="text-xs text-white/50">{member.points ?? 0} pts</span>
            {daysSinceJoin !== null && (
              <>
                <span className="text-xs text-white/35">•</span>
                <span className="text-xs text-white/50">Membru de {daysSinceJoin} zile</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 flex flex-col gap-2">
          {!isMe && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onGoToChat}
                className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95"
                style={{ backgroundColor: '#1ED75F20', border: '1px solid #1ED75F40', color: '#1ED75F' }}
              >
                <MessageSquare size={16} /> Mesaj
              </button>
              <Link href={`/profile/${member.userId}`} className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 bg-white/8 border border-white/12 text-white/80">
                <User size={16} /> Profil complet
              </Link>
            </div>
          )}
          {isMe && (
            <Link href="/profile" className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm bg-white/8 border border-white/12 text-white/80 active:scale-95 transition-transform">
              <User size={16} /> Profilul meu
            </Link>
          )}

          {!isMe && !isFriend && !isPending && (
            <button
              onClick={onAddFriend}
              className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm bg-white/8 border border-white/12 text-white/80 active:scale-95 transition-transform"
            >
              <UserPlus size={16} /> Adaugă prieten
            </button>
          )}
          {!isMe && isFriend && (
            <div className="h-10 flex items-center justify-center gap-2 text-sm text-brand-green">
              <Check size={15} /> Prieteni deja
            </div>
          )}
          {!isMe && isPending && (
            <div className="h-10 flex items-center justify-center gap-2 text-sm text-white/35">
              <Clock size={15} /> Cerere trimisă
            </div>
          )}

          {canKick && (
            <button
              onClick={onKick}
              className="h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm text-red-400 border border-red-400/20 bg-red-400/8 active:scale-95 transition-transform mt-1"
            >
              <UserX size={16} /> Elimină din comunitate
            </button>
          )}
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

function toDateInputValue(str: string): string {
  const m = str?.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}
function toTimeInputValue(str: string): string {
  const m = str?.match(/(\d{2}:\d{2})$/)
  return m ? m[1] : ''
}

function TrainingCard({ training, communityId, myUid, members, canLoad, canDelete, canEdit, onRsvp, onLoad, onDelete, onEdit }: {
  training: PlannedTraining
  communityId: string
  myUid: string
  members: CommunityMember[]
  canLoad: boolean
  canDelete: boolean
  canEdit: boolean
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
    backgroundColor: '#0D3D28',
    border: '1.5px solid #1ED75F60',
    boxShadow: '0 0 18px 0 #1ED75F18, inset 0 1px 0 #1ED75F20',
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
                  style={{ backgroundColor: '#1ED75F22', color: '#1ED75F', border: '1px solid #1ED75F40' }}>
                  ⭐ OFICIAL
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <p className={`font-black text-white ${training.official ? 'text-base' : 'text-sm'} flex-1 min-w-0`}>{training.name}</p>
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

      </div>
    </div>
  )
}

// ── Add Training Form ─────────────────────────────────────────────────────────

function AddTrainingForm({ communityId, userId, userName, isStaff, isAdmin, defaultLocation, firebaseUser, onClose }: {
  communityId: string; userId: string; userName: string; isStaff: boolean; isAdmin: boolean; defaultLocation?: string; firebaseUser: import('firebase/auth').User | null; onClose: () => void
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
  const [sendEmail, setSendEmail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rateError, setRateError] = useState('')
  const [showEquipment, setShowEquipment] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
  const [exercises, setExercises] = useState<{ name: string; sets: string; repsPerSet: string }[]>([])

  const EQUIPMENT_OPTIONS = [
    { id: 'rings', label: '🪢 Inele' },
    { id: 'elastic_bands', label: '🔁 Benzi elastice' },
    { id: 'parallels', label: '⚙️ Paralele' },
    { id: 'jump_rope', label: '🪝 Coardă de sărit' },
  ]
  const [customEquipment, setCustomEquipment] = useState('')

  function toggleEquipment(id: string) {
    setSelectedEquipment(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setRateError('')
    try {
      // Rate limit: max 5 trainings per day per community per user
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const rateSnap = await getDocs(query(
        collection(db, 'communities', communityId, 'trainings'),
        where('authorId', '==', userId),
      ))
      const todayCount = rateSnap.docs.filter(d => {
        const ts = d.data().createdAt?.toDate?.()
        return ts && ts >= todayStart
      }).length
      if (todayCount >= 5) {
        setRateError('Ai atins limita de 5 antrenamente pe zi în această comunitate.')
        setSaving(false)
        return
      }
      const validExercises = exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: ex.name.trim(),
          sets: parseInt(ex.sets) || 1,
          repsPerSet: parseInt(ex.repsPerSet) || 10,
        }))
      const trainingTimeStart = toAndroidDateTime(date, start)
      const trainingTimeEnd = toAndroidDateTime(date, end)
      const docRef = await addDoc(collection(db, 'communities', communityId, 'trainings'), {
        name:            name.trim(),
        description:     desc.trim(),
        timeStart:       trainingTimeStart,
        timeEnd:         trainingTimeEnd,
        location:        location.trim(),
        authorId:        userId,
        authorName:      userName,
        authorCoach:     isStaff,
        authorAdmin:     false,
        official,
        reminderMinutes: 30,
        rsvps:           userId ? { [userId]: 'GOING' } : {},
        rsvpNames:       userId ? { [userId]: userName } : {},
        ...(validExercises.length > 0 ? { exercises: validExercises } : {}),
        ...(selectedEquipment.length > 0 || customEquipment.trim() ? {
        equipment: customEquipment.trim()
          ? [...selectedEquipment, customEquipment.trim()]
          : selectedEquipment
      } : {}),
        createdAt:       serverTimestamp(),
      })
      if (sendEmail) {
        try {
          const idToken = await (firebaseUser ?? auth.currentUser)?.getIdToken(true)
          console.log('[email] idToken:', idToken ? 'ok' : 'null')
          if (idToken) {
            const res = await fetch('/api/email/training', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({
                communityId,
                trainingId: docRef.id,
                trainingName: name.trim(),
                description: desc.trim(),
                timeStart: trainingTimeStart,
                timeEnd: trainingTimeEnd,
                location: location.trim(),
                authorName: userName,
              }),
            })
            const text = await res.text()
            console.log('[email] response:', res.status, text)
          }
        } catch (err) {
          console.error('[email] error:', err)
        }
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl p-4 mb-4 border border-brand-green/30" style={{ backgroundColor: 'var(--app-bg)' }}>
      <p className="text-sm font-bold text-white mb-3">Adaugă antrenament</p>
      <div className="flex flex-col gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nume *"
          maxLength={120}
          className="h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descriere"
          maxLength={1000}
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
          maxLength={100}
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
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              className="accent-brand-green w-4 h-4"
            />
            <span>Notificare email</span>
            <span className="text-xs text-white/35">(trimite email membrilor)</span>
          </label>
        )}

        {/* Exercises */}
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/45">Exerciții</span>
            <button
              type="button"
              onClick={() => setExercises(prev => [...prev, { name: '', sets: '3', repsPerSet: '10' }])}
              className="text-xs text-brand-green font-bold hover:text-brand-green/80 transition-colors"
            >
              + Adaugă
            </button>
          </div>
          {exercises.map((ex, i) => (
            <div key={i} className="flex gap-1.5 mb-1.5 items-center">
              <input
                value={ex.name}
                onChange={e => setExercises(prev => prev.map((ex2, j) => j === i ? { ...ex2, name: e.target.value } : ex2))}
                placeholder="Exercițiu"
                maxLength={80}
                className="flex-1 min-w-0 h-9 rounded-lg px-2.5 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
              />
              <input
                value={ex.sets}
                onChange={e => setExercises(prev => prev.map((ex2, j) => j === i ? { ...ex2, sets: e.target.value } : ex2))}
                placeholder="Set"
                type="number"
                min="1"
                className="w-12 h-9 rounded-lg px-1 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 text-center"
              />
              <span className="text-white/30 text-xs flex-shrink-0">×</span>
              <input
                value={ex.repsPerSet}
                onChange={e => setExercises(prev => prev.map((ex2, j) => j === i ? { ...ex2, repsPerSet: e.target.value } : ex2))}
                placeholder="Rep"
                type="number"
                min="1"
                className="w-12 h-9 rounded-lg px-1 text-xs text-white outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 text-center"
              />
              <button
                type="button"
                onClick={() => setExercises(prev => prev.filter((_, j) => j !== i))}
                className="w-7 h-7 rounded-full flex items-center justify-center text-red-400/50 hover:text-red-400 flex-shrink-0 text-base leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Equipment selector */}
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowEquipment(v => !v)}
            className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 transition-colors"
          >
            <span>{showEquipment ? '▾' : '▸'}</span>
            <span>Aduci echipament?</span>
            {(selectedEquipment.length > 0 || customEquipment.trim()) && (
              <span className="text-brand-green font-bold">({selectedEquipment.length + (customEquipment.trim() ? 1 : 0)})</span>
            )}
          </button>
          {showEquipment && (
            <div className="mt-2 flex flex-col gap-1.5 pl-1">
              {EQUIPMENT_OPTIONS.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEquipment.includes(opt.id)}
                    onChange={() => toggleEquipment(opt.id)}
                    className="accent-brand-green w-4 h-4"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              <input
                value={customEquipment}
                onChange={e => setCustomEquipment(e.target.value)}
                placeholder="Altceva (ex: kettlebell...)"
                maxLength={60}
                className="mt-1 h-9 rounded-xl px-3 text-xs text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
              />
            </div>
          )}
        </div>

        {rateError && <p className="text-xs text-red-400 text-center">{rateError}</p>}
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

function formatPostDate(createdAt: CommunityPost['createdAt']): string {
  if (!createdAt) return ''
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt as unknown as number)
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'acum'
  if (mins < 60) return `acum ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `acum ${hours}h`
  return date.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatPostDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function PostCard({ post, communityId, myUid, myName, myRole, isSuperAdmin, myProTitle, onDelete }: {
  post: CommunityPost
  communityId: string
  myUid: string
  myName: string
  myRole: MemberRole
  isSuperAdmin: boolean
  myProTitle?: boolean
  onDelete: () => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)
  // Emoji reactions: { [emoji]: string[] (userIds) }
  const [reactionCounts, setReactionCounts] = useState<Record<string, string[]>>({})
  const [myReaction, setMyReaction] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const POST_REACTIONS = ['💪', '❤️', '🔥', '👏', '😮']

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'communities', communityId, 'posts', post.id, 'reactions'),
      snap => {
        const counts: Record<string, string[]> = {}
        let mine: string | null = null
        snap.docs.forEach(d => {
          const { emoji } = d.data() as { emoji: string }
          if (!counts[emoji]) counts[emoji] = []
          counts[emoji].push(d.id)
          if (d.id === myUid) mine = emoji
        })
        setReactionCounts(counts)
        setMyReaction(mine)
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
  const isWorkoutPost = post.workoutExercises !== undefined

  async function setReaction(emoji: string) {
    if (!myUid) return
    const ref = doc(db, 'communities', communityId, 'posts', post.id, 'reactions', myUid)
    if (myReaction === emoji) {
      await deleteDoc(ref)
    } else {
      await setDoc(ref, { emoji, at: serverTimestamp() })
    }
    setShowReactionPicker(false)
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

      {/* Header: avatar + name + date — tap author to view profile */}
      <div className="flex items-start justify-between mb-3">
        <Link
          href={post.authorId === myUid ? '/profile' : `/profile/${post.authorId}`}
          className="flex items-center gap-2.5 active:opacity-70 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1ED75F22', border: `1.5px solid ${roleColor}` }}>
            {post.authorPhotoUrl
              ? <Image src={post.authorPhotoUrl} alt={post.authorName} width={36} height={36} className="object-cover w-full h-full" />
              : <span className="text-sm font-black" style={{ color: roleColor }}>{post.authorName.charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white leading-none">{post.authorName}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md leading-none"
                style={{ backgroundColor: `${roleColor}22`, color: roleColor }}>
                {post.authorId === myUid && myProTitle ? '🎯 Pro' : ROLE_LABELS[post.authorRole as MemberRole]}
              </span>
            </div>
            <span className="text-[11px] text-white/35">{formatPostDate(post.createdAt)}</span>
          </div>
        </Link>
        {(post.authorId === myUid || myRole === 'ADMIN' || isSuperAdmin) && (
          <button onClick={onDelete} aria-label="Șterge postare" className="text-red-400/60 hover:text-red-400 transition-colors p-1 mt-0.5">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Description — more prominent (workout note or regular content) */}
      {(isWorkoutPost ? post.workoutNote : post.content) && (
        <p className="text-[15px] text-white/90 leading-snug mb-3 whitespace-pre-line font-medium">
          {isWorkoutPost ? post.workoutNote : post.content}
        </p>
      )}

      {/* Workout training block */}
      {isWorkoutPost && (
        <div className="rounded-xl border border-white/10 bg-white/4 p-3 mb-3">
          {/* Stats chips */}
          <div className="flex items-center gap-3 mb-2.5">
            {post.workoutDuration != null && (
              <span className="text-xs font-semibold text-white/60">⏱ {formatPostDuration(post.workoutDuration)}</span>
            )}
            {post.workoutReps != null && post.workoutReps > 0 && (
              <span className="text-xs font-semibold text-white/60">🔁 {post.workoutReps} rep</span>
            )}
          </div>
          {/* Exercises */}
          {post.workoutExercises && post.workoutExercises.length > 0 && (
            <div className="flex flex-col gap-1">
              {post.workoutExercises.map((ex, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-green/60 flex-shrink-0" />
                  <span className="text-xs text-white/70">{ex.summary}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {post.photoUrl && (
        <div className="relative mb-3 rounded-xl overflow-hidden" style={{ maxHeight: 288 }}>
          <Image
            src={post.photoUrl}
            alt={`${post.authorName}'s post image`}
            width={600}
            height={288}
            className="w-full object-cover"
            style={{ maxHeight: 288 }}
            unoptimized={!post.photoUrl.startsWith('https://firebasestorage')}
          />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-1">
        {POST_REACTIONS.map(e => {
          const uids = reactionCounts[e] ?? []
          const count = uids.length
          if (count === 0 && myReaction !== e) return null
          return (
            <button key={e} onClick={() => setReaction(e)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                myReaction === e ? 'bg-brand-green/20 border-brand-green/50 text-brand-green' : 'bg-white/8 border-white/12 text-white/60'
              }`}>
              {e} {count > 0 && count}
            </button>
          )
        })}
        {!showReactionPicker && (
          <button onClick={() => setShowReactionPicker(true)}
            className="w-7 h-7 rounded-full bg-white/8 border border-white/12 text-white/40 text-sm flex items-center justify-center">+</button>
        )}
        {showReactionPicker && (
          <div className="flex items-center gap-1">
            {POST_REACTIONS.map(e => (
              <button key={e} onClick={() => { setReaction(e); setShowReactionPicker(false) }}
                className="w-8 h-8 text-lg flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">{e}</button>
            ))}
          </div>
        )}
        <button onClick={() => setShowComments(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold ml-1 transition-colors ${showComments ? 'text-brand-green' : 'text-white/40 hover:text-white/60'}`}>
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

// ── Edit Community Modal ──────────────────────────────────────────────────────

function EditCommunityModal({ community, onClose }: {
  community: CommunityDoc
  onClose: () => void
}) {
  const [name, setName] = useState(community.name)
  const [description, setDescription] = useState(community.description ?? '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      let imageUrl = community.imageUrl
      if (photoFile) {
        imageUrl = await uploadCommunityPhoto(community.id, photoFile)
      }
      await updateDoc(doc(db, 'communities', community.id), {
        name: name.trim(),
        description: description.trim(),
        imageUrl,
      })
      onClose()
    } catch {
      setError('A apărut o eroare. Încearcă din nou.')
    } finally {
      setSaving(false)
    }
  }

  const displayPhoto = photoPreview || community.imageUrl || null

  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors"

  return (
    <div
      className="fixed inset-0 z-[500] flex items-end justify-center bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-t-3xl px-5 pt-4 pb-8"
        style={{ backgroundColor: 'var(--app-surface)' }}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-5">
          <p className="text-base font-black text-white">Editează comunitatea</p>
          <button onClick={onClose} aria-label="Închide" className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X size={14} className="text-white/60" />
          </button>
        </div>

        {/* Photo picker */}
        <div className="flex justify-center mb-5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative group"
          >
            <div
              className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: '#1ED75F18', border: '2px dashed rgba(30,215,95,0.4)' }}
            >
              {displayPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayPhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-black text-brand-green/60">
                  {community.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div
              className="absolute bottom-1 right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"
              style={{ backgroundColor: '#1ED75F' }}
            >
              <Camera size={14} className="text-black" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">NUME *</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Numele comunității"
              className={inputCls}
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/40 tracking-widest mb-1.5">DESCRIERE</p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="O scurtă descriere a comunității..."
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400 px-1">{error}</p>}

          <div className="flex gap-2 mt-1">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-white/15 text-sm text-white/60 font-semibold"
            >
              Anulează
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Se salvează...
                </span>
              ) : 'Salvează'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
