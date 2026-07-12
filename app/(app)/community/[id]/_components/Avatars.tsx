'use client'

import { useState } from 'react'
import { User } from 'lucide-react'

export function RoleAvatar({ photoUrl, name, roleColor, size = 40, goldRing = false }: { photoUrl: string; name: string; roleColor: string; size?: number; goldRing?: boolean }) {
  const [imgError, setImgError] = useState(false)
  const showImg = photoUrl && !imgError
  return (
    <div className="relative rounded-full overflow-hidden flex items-center justify-center"
      style={{
        width: size, height: size,
        backgroundColor: `${roleColor}22`,
        border: `2px solid ${roleColor}`,
        outline: goldRing ? '1.5px solid #E3B24C' : 'none',
        outlineOffset: goldRing ? 2 : 0,
      }}>
      {showImg
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={photoUrl} alt={name} className="object-cover w-full h-full"
            onError={() => setImgError(true)} />
        : <span className="font-black" style={{ color: roleColor, fontSize: size * 0.35 }}>{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

export function MemberAvatar({ photoUrl, name, size = 28 }: { photoUrl?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const initials = name.trim().charAt(0).toUpperCase()
  const showImg = photoUrl && !imgError
  return (
    <div
      className="rounded-full border-2 overflow-hidden flex items-center justify-center flex-shrink-0 bg-white/20"
      style={{ width: size, height: size, borderColor: 'var(--app-surface)' }}
    >
      {showImg
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={photoUrl} alt={name} width={size} height={size} className="object-cover w-full h-full"
            onError={() => setImgError(true)} />
        : <span className="text-white font-bold" style={{ fontSize: size * 0.38 }}>{initials}</span>}
    </div>
  )
}

export function GuestAvatar({ size = 28 }: { name?: string; size?: number }) {
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
