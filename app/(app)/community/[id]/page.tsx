'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import {
  doc, collection, onSnapshot, addDoc, deleteDoc, deleteField,
  updateDoc, setDoc, serverTimestamp, getDoc, query, orderBy, getDocs, where,
  increment, arrayRemove, arrayUnion, writeBatch, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { uploadPostPhoto } from '@/lib/firebase/storage'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { createNotification } from '@/lib/firebase/notifications'
import { callApi, apiErrorMessage } from '@/lib/schedule/client'
import { can } from '@/lib/schedule/permissions'
import type {
  CommunityDoc, CommunityMember, CommunityPost,
  PlannedTraining, MemberRole,
} from '@/types'
import { ROLE_LABELS, conversationId } from '@/types'
import {
  ArrowLeft, MessageSquare, Send, Plus,
  Clock, Dumbbell, Users,
  X, LogOut, UserX, Share2,
  Pencil, Info, Mail, MailX, History, ImagePlus,
  ChevronDown, ChevronUp, ShieldCheck, ClipboardList, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/context/LanguageContext'
import { useToast } from '@/lib/context/ToastContext'
import { SkeletonCard, SkeletonTrainingRow } from '@/components/ui/SkeletonLoaders'
import TrainingPhotoCard from '@/components/training/TrainingPhotoCard'
import { ROLE_COLORS, ROLE_TEXT_COLORS } from './_components/shared'
import { AddTrainingForm } from './_components/AddTrainingForm'
import { MemberAvatar, RoleAvatar } from './_components/Avatars'
import { EditCommunityModal } from './_components/EditCommunityModal'
import { JoinNotificationModal, MemberSheet } from './_components/MemberSheet'
import { PostCard, PostDetailSheet } from './_components/PostCard'
import { TrainingCard } from './_components/TrainingCard'
import {
  parseTrainingDateTime,
  compareTrainingDatesAsc,
  compareTrainingDatesDesc,
  isTrainingPast,
} from '@/lib/utils/trainingDateTime'






export default function CommunityDetailPage() {
  const { user, isSuperAdmin } = useAuth()
  const { displayName: myName, photoUrl: myPhoto } = useMyProfile()
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
  const [tab, setTab] = useState(1) // always default: Antrenamente
  // Deep link: /community/{id}?tab=membri (`progress` / `orar` from old notifications land on Membri)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    const map: Record<string, number> = { feed: 0, antrenamente: 1, membri: 2, progress: 2, orar: 2 }
    if (t && t in map) setTab(map[t])
  }, [])
  const [loading, setLoading] = useState(true)
  const [postText, setPostText] = useState('')
  const [postImage, setPostImage] = useState<File | null>(null)
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null)
  const postImageRef = useRef<HTMLInputElement>(null)
  const [posting, setPosting] = useState(false)
  const [showPostMentionList, setShowPostMentionList] = useState(false)
  const [postMentionQuery, setPostMentionQuery] = useState('')
  const [mentionedUids, setMentionedUids] = useState<Set<string>>(new Set())
  const postInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const [showAddTraining, setShowAddTraining] = useState(false)
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [_openMenuId, setOpenMenuId] = useState<string | null>(null)
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
  const [recentCollapsed, setRecentCollapsed] = useState(false)
  const autoClosedRef = useRef<Set<string>>(new Set())

  // Kick confirmation
  const [kickTarget, setKickTarget] = useState<CommunityMember | null>(null)
  const [kicking, setKicking] = useState(false)
  const kickDialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(kickDialogRef, !!kickTarget)

  // Community edit
  const [showEditCommunity, setShowEditCommunity] = useState(false)

  // Member sheet
  const [memberSheetTarget, setMemberSheetTarget] = useState<CommunityMember | null>(null)
  // Post detail sheet
  const [postDetailTarget, setPostDetailTarget] = useState<CommunityPost | null>(null)

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

  // Silent reconciliation: fix drifted memberCount
  const reconciledRef = useRef(false)
  useEffect(() => {
    if (reconciledRef.current) return
    if (!community || !user || members.length === 0) return
    if (community.memberCount !== members.length) {
      reconciledRef.current = true
      updateDoc(doc(db, 'communities', id), { memberCount: members.length }).catch(() => {})
    }
  }, [community, members, user, id])

  // Self-heal stale member photo/name: sync from user profile to member doc
  const photoSyncedRef = useRef(false)
  useEffect(() => {
    if (photoSyncedRef.current || !user || !isMember || !members.length) return
    const me = members.find(m => m.userId === user.uid)
    if (!me) return
    const freshPhoto = myPhoto ?? user.photoURL ?? ''
    const freshName = myName || user.displayName || ''
    const needsPhoto = freshPhoto && me.photoUrl !== freshPhoto
    const needsName = freshName && me.displayName !== freshName
    if (!needsPhoto && !needsName) return
    photoSyncedRef.current = true
    const patch: Record<string, string> = {}
    if (needsPhoto) patch.photoUrl = freshPhoto
    if (needsName) patch.displayName = freshName
    updateDoc(doc(db, 'communities', id, 'members', user.uid), patch).catch(() => {})
  }, [user, isMember, members, myPhoto, myName, id])

  // Bulk-fetch photos/names from user profiles for members with missing or stale data
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string>>({})
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const memberPhotosFetchedRef = useRef(false)
  useEffect(() => {
    if (memberPhotosFetchedRef.current || !user || !members.length) return
    const stale = members.filter(m =>
      m.userId !== user.uid && (!m.photoUrl || !m.displayName || m.displayName === 'Utilizator')
    )
    if (stale.length === 0) { memberPhotosFetchedRef.current = true; return }
    memberPhotosFetchedRef.current = true
    async function fetchProfiles() {
      const photos: Record<string, string> = {}
      const names: Record<string, string> = {}
      await Promise.allSettled(
        stale.map(async (m) => {
          const snap = await getDoc(doc(db, 'users', m.userId))
          if (!snap.exists()) return
          const data = snap.data()
          const url = (data.photoUrl as string) || ''
          const name = (data.displayName as string) || ''
          const patch: Record<string, string> = {}
          if (url && m.photoUrl !== url) { photos[m.userId] = url; patch.photoUrl = url }
          if (name && name !== 'Utilizator' && m.displayName !== name) { names[m.userId] = name; patch.displayName = name }
          if (Object.keys(patch).length > 0) {
            updateDoc(doc(db, 'communities', id, 'members', m.userId), patch).catch(() => {})
          }
        })
      )
      if (Object.keys(photos).length > 0) setMemberPhotos(photos)
      if (Object.keys(names).length > 0) setMemberNames(names)
    }
    fetchProfiles()
  }, [user, members, id])

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
      async snap => {
        let list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)
          .filter(t => !t.deletedAt)
        // Fallback: if main collection is empty, try trainings_safe mirror
        if (list.length === 0) {
          try {
            const safeSnap = await getDocs(collection(db, 'communities', id, 'trainings_safe'))
            list = safeSnap.docs
              .map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)
              .filter(t => !t.deletedAt)
          } catch { /* mirror may not exist yet */ }
        }
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        setTrainings(list)
        setTrainingsLoaded(true)
      },
      () => { setTrainingsLoaded(true) /* non-members can't read trainings — silently ignore */ }
    )
  }, [id, user])

  // Auto-close ended trainings: attendance = RSVP "GOING" + check-ins.
  // Points are applied server-side (configurable, idempotent); staff can correct for 48h.
  useEffect(() => {
    if (!user || !isMember) return
    const isStaff = myRole === 'ADMIN' || myRole === 'MODERATOR' || myRole === 'TRAINER'
    if (!isStaff && !isSuperAdmin) return

    const pastUnclosed = trainings.filter(t => isTrainingPast(t) && !t.isClosed)
    pastUnclosed.forEach(async (t) => {
      if (autoClosedRef.current.has(t.id)) return
      autoClosedRef.current.add(t.id)
      const res = await callApi(`/api/community/${id}/trainings/${t.id}/attendance`, { mode: 'auto' })
      if (!res.ok && res.status >= 500) autoClosedRef.current.delete(t.id)
    })
  }, [trainings, user, isMember, myRole, id, isSuperAdmin])

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
    if (tab === 2) loadSocialStatus()
  }, [tab, id, loadSocialStatus])


  function dismissCommNotifPrompt() {
    localStorage.setItem(`calipal_comm_notif_asked_${id}`, '1')
    setShowCommNotifPrompt(false)
  }

  async function joinCommunity() {
    if (!user || joining) return
    setJoining(true)
    try {
      // Read canonical name/photo from Firestore to avoid stale hook defaults
      const userSnap = await getDoc(doc(db, 'users', user.uid))
      const userData = userSnap.data()
      const memberName = userData?.displayName || myName || user.displayName || ''
      const memberPhoto = userData?.photoUrl || myPhoto || user.photoURL || null
      const batch = writeBatch(db)
      batch.set(doc(db, 'communities', id, 'members', user.uid), {
        userId: user.uid,
        displayName: memberName,
        role: 'MEMBER',
        level: 1,
        points: 0,
        photoUrl: memberPhoto,
        joinedAt: serverTimestamp(),
      })
      batch.update(doc(db, 'communities', id), { memberCount: increment(1) })
      batch.update(doc(db, 'users', user.uid), { joinedCommunityIds: arrayUnion(id) })
      await batch.commit()
      setShowJoinNotif(true)
    } catch {
      showToast('Eroare la alăturare. Încearcă din nou.', 'error')
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
      router.push('/community?browse')
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
        user?.uid,
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

  // ── @mention helpers ──
  function handlePostTextChange(val: string) {
    setPostText(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = val.slice(atIdx + 1)
      if (!afterAt.includes(' ') && afterAt.length > 0 && afterAt.length <= 30) {
        setPostMentionQuery(afterAt)
        setShowPostMentionList(true)
        return
      }
    }
    setShowPostMentionList(false)
  }

  function insertPostMention(name: string, userId: string) {
    const atIdx = postText.lastIndexOf('@')
    setPostText(postText.slice(0, atIdx) + '@' + name + ' ')
    setMentionedUids(prev => new Set(prev).add(userId))
    setShowPostMentionList(false)
    postInputRef.current?.focus()
  }

  const postMentionFiltered = showPostMentionList
    ? members.filter(m => m.displayName.toLowerCase().includes(postMentionQuery.toLowerCase()) && m.userId !== user?.uid).slice(0, 5)
    : []

  async function addPost() {
    if (!user || !postText.trim() || posting) return
    setPosting(true)
    const mentionIds = [...mentionedUids].filter(uid => uid !== user.uid)
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
        ...(mentionIds.length > 0 && { mentionedUserIds: mentionIds }),
      })
      if (postImage) {
        try {
          const photoUrl = await uploadPostPhoto(id, docRef.id, postImage)
          await updateDoc(docRef, { photoUrl })
        } catch { /* non-critical — post created without image */ }
      }
      // Notify mentioned users
      if (mentionIds.length > 0) {
        const communityName = community?.name ?? ''
        await Promise.allSettled(
          mentionIds.map(uid =>
            createNotification(uid, 'POST_MENTION', communityName, `${myName} te-a menționat într-o postare`, id, user?.uid)
          )
        )
      }
      setPostText('')
      setPostImage(null)
      setPostImagePreview(null)
      setMentionedUids(new Set())
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
    const tr = trainings.find(t => t.id === trainingId)
    if (typeof tr?.capacity === 'number') {
      const res = await callApi(`/api/community/${id}/trainings/${trainingId}/rsvp`, { status })
      if (!res.ok) showToast(apiErrorMessage(res.reason), 'error')
      return res.ok
    }
    const nameUpdate = status === 'GOING' && myName
      ? { [`rsvpNames.${user.uid}`]: myName }
      : { [`rsvpNames.${user.uid}`]: deleteField() }
    const photoUpdate = status === 'GOING' && myPhoto
      ? { [`rsvpPhotos.${user.uid}`]: myPhoto }
      : { [`rsvpPhotos.${user.uid}`]: deleteField() }
    await updateDoc(doc(db, 'communities', id, 'trainings', trainingId), {
      [`rsvps.${user.uid}`]: status,
      ...nameUpdate,
      ...photoUpdate,
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
    <div className="flex items-center justify-center min-h-[calc(100dvh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!community) return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-64px)] px-6 text-center" style={{ backgroundColor: 'var(--app-bg)' }}>
      <p className="text-4xl mb-4">🏚️</p>
      <p className="text-base font-bold text-white mb-1">{t('comm_detail.not_found_title')}</p>
      <p className="text-sm text-white/50 mb-6">{t('comm_detail.not_found_text')}</p>
      <button onClick={() => router.replace('/community?browse')}
        className="h-11 px-6 rounded-2xl bg-brand-green text-black text-sm font-bold">
        {t('comm_detail.back')}
      </button>
    </div>
  )

  // Staff first (Fondator, Antrenor, Voluntar), then members; alphabetical within a role
  const ROLE_ORDER = ['ADMIN', 'TRAINER', 'MODERATOR', 'MEMBER']
  const sortedMembers = [...members].sort((a, b) =>
    ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.displayName.localeCompare(b.displayName, 'ro'))



  // Tabs available to non-members: only Membri
  const visibleTabs = isMember
    ? [
        { label: t('comm_detail.tab_feed'), Icon: MessageSquare },
        { label: t('comm_detail.tab_trainings'), Icon: Dumbbell },
        { label: t('comm_detail.tab_members'), Icon: Users },
      ]
    : [{ label: t('comm_detail.tab_members'), Icon: Users }]

  // For non-members, always show tab index 0 (Membri → effectiveTab 2)
  const effectiveTab = isMember ? tab : 2

  // Split trainings into upcoming and recent past (last 7 days)
  const RECENT_PAST_DAYS = 7
  const recentCutoff = new Date(Date.now() - RECENT_PAST_DAYS * 24 * 60 * 60 * 1000)
  const trainingSorter = (a: PlannedTraining, b: PlannedTraining) => {
    if (a.official && !b.official) return -1
    if (!a.official && b.official) return 1
    return compareTrainingDatesAsc(a, b)
  }
  const upcoming = [...trainings].filter(t => !isTrainingPast(t)).sort(trainingSorter)
  const recentPast = [...trainings].filter(t => {
    if (!isTrainingPast(t)) return false
    const end = parseTrainingDateTime(t.timeEnd || t.timeStart, t.date)
    return !!end && end >= recentCutoff
  }).sort(compareTrainingDatesDesc).slice(0, 1)

  return (
    <div className="min-h-[calc(100dvh-64px)] animate-page-enter" style={{ backgroundColor: 'var(--app-bg)' }}>
      <h1 className="sr-only">{community?.name ?? 'Community'}</h1>

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
              onClick={() => router.push('/community?browse')}
              className="absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            {/* Right controls row */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                aria-label="Distribuie comunitatea"
                onClick={shareCommunity}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Share2 size={16} className="text-white" />
              </button>
              {isMember && (
                <div className="relative">
                  <button
                    onClick={() => setShowCommunityMenu(v => !v)}
                    aria-label="Opțiuni comunitate"
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <Pencil size={15} className="text-white" />
                  </button>
                  {showCommunityMenu && (
                    <div className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[200px]" style={{ backgroundColor: 'var(--app-bg)' }}>
                      <button onClick={() => { setShowDescription(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Info size={14} /> {t('comm_detail.description')}</button>
                      {(isSuperAdmin || myRole === 'ADMIN') && (
                        <button onClick={() => { setShowEditCommunity(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Pencil size={14} /> {t('comm_detail.edit')}</button>
                      )}
                      <button onClick={toggleEmailNotifications} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left">
                        {myEmailNotifications ? <MailX size={14} /> : <Mail size={14} />}
                        {myEmailNotifications ? t('comm_detail.disable_emails') : t('comm_detail.enable_emails')}
                      </button>
                      <button onClick={leaveCommunity} disabled={leaving} className="w-full px-4 py-3 text-sm text-red-400 hover:bg-white/8 flex items-center gap-2 text-left disabled:opacity-50">
                        <LogOut size={14} /> {leaving ? '...' : t('comm_detail.leave')}
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
              <p className="text-xs text-white/50 mt-0.5">{members.length} {t('common.members')} · {community.location ?? ''}</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Plain text header (no image) ── */
        <div className="px-4 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-center gap-3">
            <button aria-label="Înapoi" onClick={() => router.push('/community?browse')} className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ArrowLeft size={18} className="text-white/80" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-white text-base truncate">{community?.name ?? '...'}</p>
                {community?.verified && <ShieldCheck size={14} className="text-brand-green flex-shrink-0" />}
              </div>
              <p className="text-xs text-white/45">{members.length} {t('common.members')} · {isMember ? t('comm_detail.member_badge') : t('comm_detail.visitor_badge')}</p>
            </div>
            <button aria-label="Distribuie" onClick={shareCommunity} className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <Share2 size={16} className="text-white/70" />
            </button>
            {isMember && (
              <div className="relative flex-shrink-0">
                <button onClick={() => setShowCommunityMenu(v => !v)} aria-label="Opțiuni comunitate" className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center">
                  <Pencil size={15} className="text-white/70" />
                </button>
                {showCommunityMenu && (
                  <div className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl border border-white/10 min-w-[200px]" style={{ backgroundColor: 'var(--app-bg)' }}>
                    <button onClick={() => { setShowDescription(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Info size={14} /> {t('comm_detail.description')}</button>
                    {(isSuperAdmin || myRole === 'ADMIN') && (
                      <button onClick={() => { setShowEditCommunity(true); setShowCommunityMenu(false) }} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left"><Pencil size={14} /> {t('comm_detail.edit')}</button>
                    )}
                    <button onClick={toggleEmailNotifications} className="w-full px-4 py-3 text-sm text-white/80 hover:bg-white/8 flex items-center gap-2 text-left">
                      {myEmailNotifications ? <MailX size={14} /> : <Mail size={14} />}
                      {myEmailNotifications ? t('comm_detail.disable_emails') : t('comm_detail.enable_emails')}
                    </button>
                    <button onClick={leaveCommunity} disabled={leaving} className="w-full px-4 py-3 text-sm text-red-400 hover:bg-white/8 flex items-center gap-2 text-left disabled:opacity-50">
                      <LogOut size={14} /> {leaving ? '...' : t('comm_detail.leave')}
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
          style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.04)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">
              {user ? t('comm_detail.visitor') : t('comm_detail.login_to_join')}
            </p>
            <p className="text-xs text-white/50 mt-0.5">
              {user ? t('comm_detail.join_access_text') : t('comm_detail.login_access_text')}
            </p>
          </div>
          {user ? (
            <button
              onClick={joinCommunity}
              disabled={joining}
              className="h-9 px-4 rounded-xl bg-brand-green text-black text-sm font-black flex-shrink-0 disabled:opacity-50"
            >
              {joining ? '...' : t('community.join_btn')}
            </button>
          ) : (
            <div className="flex gap-2 flex-shrink-0">
              <Link href="/login">
                <span className="h-9 px-3 rounded-xl border border-white/20 text-xs font-bold text-white flex items-center">{t('home.login')}</span>
              </Link>
              <Link href="/register">
                <span className="h-9 px-4 rounded-xl bg-brand-green text-black text-xs font-black flex items-center">{t('comm_detail.join_short')}</span>
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
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.07)', border: '1px solid rgba(var(--accent-rgb), 0.21)' }}>
              <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold text-brand-green flex-1 min-w-0 truncate">{active.name} — în desfășurare acum</span>
              <button onClick={() => setTab(1)} className="text-xs font-black text-brand-green/70 flex-shrink-0">Vezi →</button>
            </div>
          </div>
        ) : null
      })()}

      {/* Tabs — non-members only see Membri */}
      <div className="max-w-lg mx-auto">
      <div className="flex border-b border-white/10 mt-3 sticky top-0 z-20 tab-bar" style={{ backgroundColor: 'var(--app-bg)' }}>
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
                <div className="flex gap-2 relative">
                  {/* @mention dropdown */}
                  {showPostMentionList && postMentionFiltered.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 rounded-xl max-h-40 overflow-y-auto z-10 mt-1 border border-white/12"
                      style={{ backgroundColor: 'var(--app-surface)' }}
                    >
                      {postMentionFiltered.map(m => (
                        <button
                          key={m.userId}
                          onClick={() => insertPostMention(m.displayName, m.userId)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left text-sm text-white/80"
                        >
                          <MemberAvatar photoUrl={m.photoUrl} name={m.displayName} size={24} />
                          {m.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    ref={postInputRef as React.RefObject<HTMLInputElement>}
                    value={postText}
                    onChange={e => handlePostTextChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addPost()}
                    placeholder={t('comm_detail.post_placeholder')}
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
            {/* Interleaved feed: training photo cards + posts sorted chronologically */}
            {!postsLoaded
              ? <div className="flex flex-col gap-3">{[0,1,2].map(i => <SkeletonCard key={i} />)}</div>
              : (() => {
                const now = new Date()
                const fourHoursMs = 4 * 60 * 60 * 1000

                const photoEligible = trainingsLoaded ? trainings.filter(t => {
                  const start = t.timeStart ? parseTrainingDateTime(t.timeStart, t.date) : null
                  const end = t.timeEnd ? parseTrainingDateTime(t.timeEnd, t.date) : null
                  if (!start) return false
                  if (start > now) return false
                  const isOngoing = end ? now < end : false
                  const isRecent = end ? now < new Date(end.getTime() + fourHoursMs) : false
                  return isOngoing || isRecent || (t.photoCount && t.photoCount > 0)
                }) : []

                type FeedItem =
                  | { type: 'training'; training: PlannedTraining; sortMs: number }
                  | { type: 'post'; post: CommunityPost; sortMs: number }

                const trainingItems: FeedItem[] = photoEligible.map(tr => {
                  const end = tr.timeEnd ? parseTrainingDateTime(tr.timeEnd, tr.date) : null
                  const start = tr.timeStart ? parseTrainingDateTime(tr.timeStart, tr.date) : null
                  return { type: 'training' as const, training: tr, sortMs: end?.getTime() ?? start?.getTime() ?? 0 }
                })

                const postItems: FeedItem[] = posts.map(p => ({
                  type: 'post' as const, post: p, sortMs: p.createdAt?.toMillis?.() ?? 0,
                }))

                const feed = [...trainingItems, ...postItems].sort((a, b) => b.sortMs - a.sortMs)

                if (feed.length === 0 && !isSuperAdmin) {
                  return <p className="text-sm text-white/35 text-center py-8">{t('comm_detail.no_posts_first')}</p>
                }

                return feed.map(item =>
                  item.type === 'training' ? (
                    <TrainingPhotoCard
                      key={`photo-${item.training.id}`}
                      training={item.training}
                      communityId={id}
                      myUid={user?.uid ?? ''}
                      myName={myName}
                      myPhoto={myPhoto}
                      isSuperAdmin={isSuperAdmin}
                    />
                  ) : (
                    <PostCard
                      key={item.post.id}
                      post={item.post}
                      communityId={id}
                      myUid={user?.uid ?? ''}
                      myName={myName}
                      myPhoto={myPhoto}
                      myRole={myRole}
                      isSuperAdmin={isSuperAdmin}
                      members={members}
                      onDelete={() => deletePost(item.post.id)}
                      onOpen={() => setPostDetailTarget(item.post)}
                    />
                  )
                )
              })()}
          </div>
        )}

        {/* ── Antrenamente ── */}
        {effectiveTab === 1 && (
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
                isAdmin={myRole === 'ADMIN' || myRole === 'MODERATOR' || isSuperAdmin}
                defaultLocation={community?.location ?? ''}
                firebaseUser={user ?? null}
                onClose={() => setShowAddTraining(false)}
              />
            )}
            {!trainingsLoaded
              ? <div className="flex flex-col gap-3">{[0,1,2].map(i => <SkeletonTrainingRow key={i} />)}</div>
              : upcoming.length === 0 && recentPast.length === 0
              ? (
                <div className="text-center py-12">
                  <Dumbbell size={36} className="text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/35">Niciun antrenament planificat.</p>
                </div>
              )
              : <>
                {upcoming.map(tr => (
                  <TrainingCard
                    key={tr.id}
                    training={tr}
                    communityId={id}
                    myUid={user?.uid ?? ''}
                    members={members}
                    canLoad={isMember && (tr.exercises?.length ?? 0) > 0}
                    canDelete={isSuperAdmin}
                    canEdit={tr.authorId === user?.uid}
                    onRsvp={status => rsvp(tr.id, status)}
                    onLoad={() => loadTraining(tr)}
                    onDelete={async () => {
                      try {
                        const token = await auth.currentUser?.getIdToken()
                        const res = await fetch('/api/admin/delete-training', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ communityId: id, trainingId: tr.id }),
                        })
                        const data = await res.json()
                        if (!data.ok) console.error('Delete failed:', data.reason)
                      } catch (e) { console.error('Delete error:', e) }
                    }}
                    onEdit={fields => updateDoc(doc(db, 'communities', id, 'trainings', tr.id), fields)}
                  />
                ))}
                {recentPast.length > 0 && (
                  <div className="mt-4">
                    <button onClick={() => setRecentCollapsed(v => !v)}
                      className="flex items-center gap-2 text-xs text-white/40 mb-2 hover:text-white/60 transition-colors">
                      <Clock size={12} />
                      {t('comm_detail.last_workout')}
                      {recentCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </button>
                    {!recentCollapsed && recentPast.map(tr => (
                      <div key={tr.id} className="opacity-40 pointer-events-none select-none">
                        <TrainingCard
                          training={tr}
                          communityId={id}
                          myUid={user?.uid ?? ''}
                          members={members}
                          canLoad={false}
                          canDelete={false}
                          canEdit={false}
                          readOnly
                          onRsvp={() => {}}
                          onLoad={() => {}}
                          onDelete={() => {}}
                          onEdit={() => {}}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>}

            {/* History link */}
            <Link href={`/training/${id}/history`}
              className="flex items-center justify-center gap-2 mt-4 py-3 rounded-2xl border border-white/10 text-sm text-white/40 hover:text-white/60 transition-colors"
              style={{ backgroundColor: 'var(--app-surface)' }}>
              <History size={14} />
              {t('training.history_title')}
            </Link>
          </div>
        )}

        {/* ── Membri ── */}
        {effectiveTab === 2 && (!user ? (
          <div className="text-center py-14">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)' }}>
              <Users size={24} className="text-brand-green" />
            </div>
            <p className="font-black text-white mb-1">{t('comm_detail.see_members')}</p>
            <p className="text-sm text-white/50 mb-5">{t('comm_detail.login_see_members')}</p>
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              <Link href="/register">
                <span className="h-11 rounded-2xl bg-brand-green text-black text-sm font-black flex items-center justify-center">{t('comm_detail.register_btn')}</span>
              </Link>
              <Link href="/login">
                <span className="h-11 rounded-2xl border border-white/15 text-white text-sm font-semibold flex items-center justify-center">{t('home.login')}</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Progress links: own plan for everyone, members' overview for coaches */}
            {isMember && user && (
              <div className="flex flex-col gap-2 mb-4">
                <ProgressLink href={`/community/${id}/member/${user.uid}`} title="Planul meu"
                  sub="Obiective, sfaturi și exerciții de la antrenor" />
                {can(myRole, 'viewMemberFile', isSuperAdmin) && (
                  <ProgressLink href={`/community/${id}/progress`} title="Progresul membrilor"
                    sub="Cine are nevoie de obiective sau exerciții" />
                )}
              </div>
            )}

            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-4">{members.length} MEMBRI</p>
            {sortedMembers.map((m, index) => {
              const roleColor = ROLE_COLORS[m.role as MemberRole] ?? 'var(--accent)'
              const roleTextColor = ROLE_TEXT_COLORS[m.role as MemberRole] ?? '#7E8A84'
              const isMe = m.userId === user?.uid
              const livePhoto = (isMe ? (myPhoto || m.photoUrl) : m.photoUrl) || memberPhotos[m.userId] || ''
              const liveName = (isMe ? (myName || m.displayName) : m.displayName) || memberNames[m.userId] || m.displayName

              return (
                <div
                  key={m.userId}
                  className="relative flex items-center gap-3 px-4 cursor-pointer active:bg-white/5 transition-colors"
                  style={{
                    minHeight: 64,
                    backgroundColor: isMe ? 'rgba(30,215,95,0.06)' : 'transparent',
                  }}
                  onClick={() => setMemberSheetTarget(m)}
                >
                  {/* Hairline divider (inset under name) */}
                  {index < sortedMembers.length - 1 && (
                    <span className="absolute bottom-0 right-0 h-px" style={{ left: 64, background: 'var(--app-divider)' }} />
                  )}

                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <RoleAvatar photoUrl={livePhoto} name={liveName} roleColor={roleColor} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-white truncate">{liveName}</span>
                      {isMe && (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ color: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb), 0.13)' }}>Tu</span>
                      )}
                    </div>
                    <span className="text-[12.5px] mt-0.5 block" style={{ color: roleTextColor }}>
                      {ROLE_LABELS[m.role as MemberRole]}
                    </span>
                  </div>
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
          fileHref={isMember && (memberSheetTarget.userId === user?.uid || can(myRole, 'viewMemberFile', isSuperAdmin))
            ? `/community/${id}/member/${memberSheetTarget.userId}` : undefined}
          onClose={() => setMemberSheetTarget(null)}
          onGoToChat={() => { goToChat(memberSheetTarget.userId, memberSheetTarget.displayName); setMemberSheetTarget(null) }}
          onAddFriend={() => { sendFriendRequest(memberSheetTarget); setMemberSheetTarget(null) }}
          onKick={() => { setKickTarget(memberSheetTarget); setMemberSheetTarget(null) }}
        />
      )}

      {/* Post detail sheet */}
      {postDetailTarget && user && (
        <PostDetailSheet
          post={postDetailTarget}
          communityId={id}
          myUid={user.uid}
          myName={myName}
          myPhoto={myPhoto}
          myRole={myRole}
          isSuperAdmin={isSuperAdmin}
          members={members}
          onDelete={() => { deletePost(postDetailTarget.id); setPostDetailTarget(null) }}
          onClose={() => setPostDetailTarget(null)}
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

function ProgressLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform"
      style={{ backgroundColor: 'var(--app-surface)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.12)' }}>
        <ClipboardList size={18} className="text-brand-green" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-white/40 truncate">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-white/25 flex-shrink-0" />
    </Link>
  )
}
