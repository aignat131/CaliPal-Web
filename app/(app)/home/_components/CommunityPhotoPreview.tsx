'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Compass, Users } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import type { CommunityDoc, CommunityPost } from '@/types'

export function CommunityPhotoPreview({ community, photoPosts }: {
  community: CommunityDoc
  photoPosts: CommunityPost[]
}) {
  const t = useT()
  const photos = photoPosts.slice(0, 4).map(p => p.photoUrl!).filter(Boolean)
  if (photos.length === 0) return null

  return (
    <Link href={`/community/${community.id}`} className="block">
      <div className="rounded-2xl overflow-hidden border border-white/10 mb-1"
        style={{ backgroundColor: 'var(--app-surface)' }}>

        {/* Discovery label */}
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5">
          <Compass size={11} className="text-brand-green" />
          <span className="text-[10px] font-bold text-brand-green tracking-widest">{t('home.discover')}</span>
        </div>

        {/* Photo mosaic */}
        <div className="relative mx-2 rounded-xl overflow-hidden" style={{ height: 180 }}>
          {photos.length === 1 && (
            <Image src={photos[0]} alt="" fill className="object-cover" sizes="(max-width: 512px) 100vw, 512px" />
          )}
          {photos.length === 2 && (
            <div className="grid grid-cols-2 gap-0.5 h-full">
              {photos.map((url, i) => (
                <div key={i} className="relative h-full">
                  <Image src={url} alt="" fill className="object-cover" sizes="256px" />
                </div>
              ))}
            </div>
          )}
          {photos.length === 3 && (
            <div className="grid grid-cols-2 gap-0.5 h-full">
              <div className="relative row-span-2">
                <Image src={photos[0]} alt="" fill className="object-cover" sizes="256px" />
              </div>
              <div className="grid grid-rows-2 gap-0.5">
                {photos.slice(1).map((url, i) => (
                  <div key={i} className="relative">
                    <Image src={url} alt="" fill className="object-cover" sizes="256px" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {photos.length >= 4 && (
            <div className="grid grid-cols-2 grid-rows-2 gap-0.5 h-full">
              {photos.slice(0, 4).map((url, i) => (
                <div key={i} className="relative">
                  <Image src={url} alt="" fill className="object-cover" sizes="256px" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Community info */}
        <div className="px-3 py-3 flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.13)' }}>
            {community.imageUrl
              ? <Image src={community.imageUrl} alt="" fill sizes="36px" className="object-cover rounded-xl" />
              : <span className="text-sm font-black text-brand-green">{community.name.charAt(0)}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm truncate">{community.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-[11px] text-white/40">
                <Users size={10} className="text-white/30" />
                {t('home.discover_members', { n: community.memberCount ?? 0 })}
              </span>
              {community.location && (
                <span className="text-[11px] text-white/30 truncate">{community.location}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
