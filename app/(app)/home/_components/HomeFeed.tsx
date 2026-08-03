'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  collection, collectionGroup, query, orderBy, limit, getDocs, getDoc, doc, deleteDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useT } from '@/lib/context/LanguageContext'
import { PostCard } from '@/app/(app)/community/[id]/_components/PostCard'
import TrainingPhotoCard from '@/components/training/TrainingPhotoCard'
import { CommunityPhotoPreview } from './CommunityPhotoPreview'
import type { CommunityPost, CommunityDoc, PlannedTraining } from '@/types'
import type { User } from 'firebase/auth'
import { Users } from 'lucide-react'
import { parseTrainingDateTime } from '@/lib/utils/trainingDateTime'

type FeedItem =
  | { type: 'post'; post: CommunityPost; key: string; sortMs: number }
  | { type: 'training'; training: PlannedTraining; communityId: string; key: string; sortMs: number }
  | { type: 'discovery'; community: CommunityDoc; photoPosts: CommunityPost[]; key: string; sortMs: number }

export function HomeFeed({ user, joinedCommunityIds, joinedCommunities, isSuperAdmin, myName, myPhoto }: {
  user: User
  joinedCommunityIds: string[]
  joinedCommunities: CommunityDoc[]
  isSuperAdmin: boolean
  myName: string
  myPhoto: string | null
}) {
  const t = useT()
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  // Build communityId → community map from joined communities
  const communityNameMap = new Map(joinedCommunities.map(c => [c.id, c]))

  useEffect(() => {
    let cancelled = false

    async function fetchFeed() {
      setLoading(true)
      try {
        const postItems: FeedItem[] = []
        const trainingItems: FeedItem[] = []

        // Fetch posts from ALL communities and trainings from joined communities in parallel
        const [allPostsSnap, trainingResults] = await Promise.all([
          // Posts from all communities via collection group query
          getDocs(query(
            collectionGroup(db, 'posts'),
            orderBy('createdAt', 'desc'),
            limit(30),
          )).catch(() => null),
          // Recent trainings from each joined community (filter for photos client-side)
          joinedCommunityIds.length > 0
            ? Promise.all(
                joinedCommunityIds.slice(0, 10).map(cid =>
                  getDocs(query(
                    collection(db, 'communities', cid, 'trainings'),
                    orderBy('timeStart', 'desc'),
                    limit(10),
                  )).then(snap =>
                    snap.docs
                      .map(d => ({ id: d.id, ...d.data() }) as PlannedTraining)
                      .filter(tr => tr.photoCount && tr.photoCount > 0)
                      .slice(0, 3)
                      .map(training => ({ training, communityId: cid }))
                  ).catch(() => [] as { training: PlannedTraining; communityId: string }[])
                )
              )
            : Promise.resolve([] as { training: PlannedTraining; communityId: string }[][]),
        ])

        // Process posts — resolve community names
        if (allPostsSnap) {
          const allPosts = allPostsSnap.docs.map(d => {
            const communityId = d.ref.parent.parent!.id
            return { id: d.id, ...d.data(), communityId } as CommunityPost
          })

          // Collect unknown community IDs and fetch their names
          const unknownIds = [...new Set(allPosts.map(p => p.communityId!).filter(cid => !communityNameMap.has(cid)))]
          if (unknownIds.length > 0) {
            await Promise.all(
              unknownIds.map(cid =>
                getDoc(doc(db, 'communities', cid)).then(snap => {
                  if (snap.exists()) communityNameMap.set(cid, { id: snap.id, ...snap.data() } as CommunityDoc)
                }).catch(() => {})
              )
            )
          }

          for (const p of allPosts) {
            const sortMs = p.createdAt?.toDate?.()?.getTime() ?? 0
            postItems.push({
              type: 'post',
              post: { ...p, communityName: communityNameMap.get(p.communityId!)?.name ?? '' },
              key: p.id,
              sortMs,
            })
          }
        }

        // Process trainings with photos — filter to past trainings only
        if (trainingResults.length > 0) {
          const now = new Date()
          for (const batch of trainingResults) {
            for (const { training: tr, communityId: cid } of batch) {
              if (tr.deletedAt) continue
              const start = tr.timeStart ? parseTrainingDateTime(tr.timeStart, tr.date) : null
              if (!start || start > now) continue
              const end = tr.timeEnd ? parseTrainingDateTime(tr.timeEnd, tr.date) : null
              const sortMs = end?.getTime() ?? start.getTime()
              trainingItems.push({
                type: 'training',
                training: tr,
                communityId: cid,
                key: `tr-${tr.id}`,
                sortMs,
              })
            }
          }
        }

        // Photo highlights: reuse already-fetched posts to build discovery cards
        const discoveryItems: FeedItem[] = []
        try {
          const discPosts = allPostsSnap
            ? allPostsSnap.docs
                .map(d => {
                  const communityId = d.ref.parent.parent!.id
                  return { id: d.id, ...d.data(), communityId } as CommunityPost
                })
                .filter(p => p.photoUrl)
            : []

          // Group by community, keep up to 4 photos per community
          const byCommunity = new Map<string, CommunityPost[]>()
          for (const p of discPosts) {
            const arr = byCommunity.get(p.communityId!) ?? []
            if (arr.length < 4) arr.push(p)
            byCommunity.set(p.communityId!, arr)
          }

          // Take up to 3 communities
          const communityIds = [...byCommunity.keys()].slice(0, 3)

          if (communityIds.length > 0) {
            const commDocs = await Promise.all(
              communityIds.map(cid => {
                const existing = communityNameMap.get(cid)
                if (existing) return Promise.resolve(existing)
                return getDoc(doc(db, 'communities', cid)).then(snap =>
                  snap.exists() ? { id: snap.id, ...snap.data() } as CommunityDoc : null
                ).catch(() => null)
              })
            )

            for (const commDoc of commDocs) {
              if (!commDoc) continue
              const photos = byCommunity.get(commDoc.id)
              if (!photos?.length) continue
              // Use the newest photo post timestamp for sorting
              const newestMs = photos[0].createdAt?.toDate?.()?.getTime() ?? 0
              discoveryItems.push({
                type: 'discovery',
                community: commDoc,
                photoPosts: photos,
                key: `disc-${commDoc.id}`,
                sortMs: newestMs,
              })
            }
          }
        } catch {
          // Photo highlights fetch failed — continue with other items
        }

        // Merge all items chronologically
        const allItems = [...postItems, ...trainingItems, ...discoveryItems]
          .sort((a, b) => b.sortMs - a.sortMs)

        if (!cancelled) setFeedItems(allItems)
      } catch {
        // Silently fail — show empty state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchFeed()
    return () => { cancelled = true }
  }, [user.uid, joinedCommunityIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(post: CommunityPost) {
    if (!post.communityId) return
    try {
      await deleteDoc(doc(db, 'communities', post.communityId, 'posts', post.id))
      setFeedItems(prev => prev.filter(item => !(item.type === 'post' && item.post.id === post.id)))
    } catch {
      // Permission denied — user is not author/admin
    }
  }

  // Skeleton loaders
  if (loading) {
    return (
      <div className="mb-5">
        <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('home.feed')}</p>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-full bg-white/8" />
                <div className="flex-1">
                  <div className="h-3.5 w-24 rounded bg-white/8 mb-1.5" />
                  <div className="h-2.5 w-16 rounded bg-white/5" />
                </div>
              </div>
              <div className="h-4 w-full rounded bg-white/6 mb-2" />
              <div className="h-4 w-3/4 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (feedItems.length === 0) {
    return (
      <div className="mb-5">
        <p className="text-[11px] font-bold text-white/40 tracking-widest mb-2">{t('home.feed')}</p>
        <div className="app-card p-6 flex flex-col items-center gap-2 text-center">
          <Users size={28} className="text-white/20" />
          <p className="text-sm text-white/40">{t('home.feed_empty')}</p>
          <Link href="/community" className="text-xs text-brand-green font-semibold mt-1">
            {t('home.feed_see_all')} →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-white/40 tracking-widest">{t('home.feed')}</p>
        <Link href="/community" className="text-xs text-brand-green font-semibold">{t('home.feed_see_all')}</Link>
      </div>

      <div className="flex flex-col gap-0">
        {feedItems.map(item => {
          if (item.type === 'discovery') {
            return (
              <CommunityPhotoPreview
                key={item.key}
                community={item.community}
                photoPosts={item.photoPosts}
              />
            )
          }

          if (item.type === 'training') {
            return (
              <div key={item.key} className="mb-1">
                {/* Community badge for training */}
                {(() => {
                  const comm = communityNameMap.get(item.communityId)
                  if (!comm) return null
                  return (
                    <Link href={`/community/${item.communityId}`}
                      className="inline-flex items-center gap-1.5 mb-1 px-2 py-0.5 rounded-full active:opacity-70 transition-opacity"
                      style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.06)' }}>
                      {comm.imageUrl
                        ? <Image src={comm.imageUrl} alt="" width={14} height={14} className="rounded-full object-cover" />
                        : <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center bg-white/10">
                            <span className="text-[7px] font-black text-white/60">{comm.name.charAt(0)}</span>
                          </div>}
                      <span className="text-[10px] font-semibold text-white/50">{comm.name}</span>
                    </Link>
                  )
                })()}
                <TrainingPhotoCard
                  training={item.training}
                  communityId={item.communityId}
                  myUid={user.uid}
                  myName={myName}
                  myPhoto={myPhoto}
                  isSuperAdmin={isSuperAdmin}
                />
              </div>
            )
          }

          const post = item.post
          return (
            <div key={item.key}>
              {/* Community badge */}
              {post.communityName && post.communityId && (
                <Link href={`/community/${post.communityId}`}
                  className="inline-flex items-center gap-1.5 mb-1 px-2 py-0.5 rounded-full active:opacity-70 transition-opacity"
                  style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.06)' }}>
                  {(() => {
                    const comm = communityNameMap.get(post.communityId)
                    return comm?.imageUrl
                      ? <Image src={comm.imageUrl} alt="" width={14} height={14} className="rounded-full object-cover" />
                      : <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center bg-white/10">
                          <span className="text-[7px] font-black text-white/60">{post.communityName.charAt(0)}</span>
                        </div>
                  })()}
                  <span className="text-[10px] font-semibold text-white/50">{post.communityName}</span>
                </Link>
              )}

              <PostCard
                post={post}
                communityId={post.communityId!}
                myUid={user.uid}
                myName={myName}
                myPhoto={myPhoto}
                myRole="MEMBER"
                isSuperAdmin={isSuperAdmin}
                members={[]}
                onDelete={() => handleDelete(post)}
                onOpen={undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
