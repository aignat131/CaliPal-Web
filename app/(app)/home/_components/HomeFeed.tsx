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
import type { CommunityPost, CommunityDoc } from '@/types'
import type { User } from 'firebase/auth'
import { Users } from 'lucide-react'

export function HomeFeed({ user, joinedCommunityIds, joinedCommunities, isSuperAdmin, myName, myPhoto }: {
  user: User
  joinedCommunityIds: string[]
  joinedCommunities: CommunityDoc[]
  isSuperAdmin: boolean
  myName: string
  myPhoto: string | null
}) {
  const t = useT()
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)

  // Build communityId → name map from joined communities
  const communityNameMap = new Map(joinedCommunities.map(c => [c.id, c]))

  useEffect(() => {
    let cancelled = false

    async function fetchFeed() {
      setLoading(true)
      try {
        if (joinedCommunityIds.length > 0) {
          // Fetch from each joined community, merge & sort
          const ids = joinedCommunityIds.slice(0, 10)
          const allPosts: CommunityPost[] = []

          const results = await Promise.all(
            ids.map(cid =>
              getDocs(query(
                collection(db, 'communities', cid, 'posts'),
                orderBy('createdAt', 'desc'),
                limit(5),
              )).then(snap =>
                snap.docs.map(d => ({
                  id: d.id,
                  ...d.data(),
                  communityId: cid,
                } as CommunityPost))
              ).catch(() => [] as CommunityPost[])
            )
          )

          results.forEach(batch => allPosts.push(...batch))

          // Sort by createdAt desc, take top 15
          allPosts.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0
            const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0
            return bTime - aTime
          })

          // Attach community names
          const merged = allPosts.slice(0, 15).map(p => ({
            ...p,
            communityName: communityNameMap.get(p.communityId!)?.name ?? '',
          }))

          if (!cancelled) setPosts(merged)
        } else {
          // Discovery feed — collection group query
          const snap = await getDocs(query(
            collectionGroup(db, 'posts'),
            orderBy('createdAt', 'desc'),
            limit(15),
          ))

          const allPosts = snap.docs.map(d => {
            const communityId = d.ref.parent.parent!.id
            return {
              id: d.id,
              ...d.data(),
              communityId,
            } as CommunityPost
          })

          // Batch-fetch community names for unique IDs
          const uniqueIds = [...new Set(allPosts.map(p => p.communityId!))]
          const nameMap = new Map<string, string>()
          await Promise.all(
            uniqueIds.map(cid =>
              getDoc(doc(db, 'communities', cid)).then(snap => {
                if (snap.exists()) nameMap.set(cid, (snap.data() as CommunityDoc).name)
              }).catch(() => {})
            )
          )

          const enriched = allPosts.map(p => ({
            ...p,
            communityName: nameMap.get(p.communityId!) ?? '',
          }))

          if (!cancelled) setPosts(enriched)
        }
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
      setPosts(prev => prev.filter(p => p.id !== post.id))
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
  if (posts.length === 0) {
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
        {posts.map(post => (
          <div key={post.id}>
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
        ))}
      </div>
    </div>
  )
}
