'use client'

import { useState } from 'react'
import Image from 'next/image'

export function MemberAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#1ED75F33' }}
    >
      {photoUrl && !imgError
        ? <Image src={photoUrl} alt={name} fill sizes="32px" className="object-cover" onError={() => setImgError(true)} />
        : <span className="text-xs font-black text-brand-green">{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}
