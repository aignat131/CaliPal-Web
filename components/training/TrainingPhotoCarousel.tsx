'use client'

import { useRef, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { TrainingPhoto } from '@/types'

interface Props {
  photos: TrainingPhoto[]
  canAddPhoto: boolean
  onAddPhoto: () => void
  isSuperAdmin?: boolean
  onDeletePhoto?: (photo: TrainingPhoto) => void
  onDeleteAll?: () => void
}

export default function TrainingPhotoCarousel({ photos, canAddPhoto, onAddPhoto, isSuperAdmin, onDeletePhoto, onDeleteAll }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const itemWidth = el.firstElementChild?.clientWidth ?? 1
    const idx = Math.round(el.scrollLeft / itemWidth)
    setActiveIndex(idx)
  }, [])

  const totalItems = photos.length + (canAddPhoto ? 1 : 0)

  if (totalItems === 0) return null

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {photos.map(photo => (
          <div
            key={photo.id}
            className="relative snap-center flex-shrink-0 rounded-xl overflow-hidden"
            style={{ width: 'calc(100% - 16px)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.photoUrl}
              alt={`Photo by ${photo.authorName}`}
              className="w-full h-64 object-cover"
            />
            <div className="absolute bottom-10 left-3 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-1">
              {photo.authorPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.authorPhotoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-brand-green/30 flex items-center justify-center text-[10px] font-bold text-white">
                  {photo.authorName.charAt(0)}
                </span>
              )}
              <span className="text-[11px] text-white/80 font-medium">{photo.authorName}</span>
            </div>
            {/* Superadmin delete button */}
            {isSuperAdmin && onDeletePhoto && (
              <button
                onClick={e => { e.stopPropagation(); onDeletePhoto(photo) }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/80 flex items-center justify-center hover:bg-red-500 transition-colors"
                aria-label="Șterge poza"
              >
                <Trash2 size={14} className="text-white" />
              </button>
            )}
          </div>
        ))}
        {canAddPhoto && (
          <button
            onClick={onAddPhoto}
            className="snap-center flex-shrink-0 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:border-brand-green/40 hover:bg-brand-green/5 transition-colors"
            style={{ width: photos.length > 0 ? '80px' : 'calc(100% - 16px)', height: '256px' }}
          >
            <Plus size={24} className="text-white/40" />
            {photos.length === 0 && (
              <span className="text-xs text-white/40">Adaugă o poză</span>
            )}
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {totalItems > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {Array.from({ length: totalItems }).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === activeIndex ? 'bg-brand-green' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      )}

      {/* Superadmin delete all button */}
      {isSuperAdmin && onDeleteAll && photos.length > 0 && (
        <button
          onClick={onDeleteAll}
          className="flex items-center justify-center gap-1.5 mt-2 w-full py-1.5 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <Trash2 size={11} />
          Șterge toate pozele
        </button>
      )}
    </div>
  )
}
