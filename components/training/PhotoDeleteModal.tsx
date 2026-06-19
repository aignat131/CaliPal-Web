'use client'

import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { TrainingPhoto } from '@/types'

interface Props {
  mode: 'single' | 'all'
  photo?: TrainingPhoto
  photoCount?: number
  onConfirm: (reason: string) => void
  onCancel: () => void
}

export default function PhotoDeleteModal({ mode, photo, photoCount, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('')

  const title = mode === 'all' ? 'Șterge toate pozele' : 'Șterge poza'
  const description = mode === 'all'
    ? `Ești sigur că vrei să ștergi toate cele ${photoCount ?? 0} poze? Autorii vor primi un mesaj cu motivul.`
    : `Ești sigur că vrei să ștergi poza lui ${photo?.authorName ?? ''}? Autorul va primi un mesaj cu motivul.`

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 px-6"
      onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-3xl p-6"
        style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: '#EF444418' }}>
              <Trash2 size={18} className="text-red-400" />
            </div>
            <h3 className="text-base font-black text-white">{title}</h3>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <X size={14} className="text-white/60" />
          </button>
        </div>

        <p className="text-sm text-white/50 mb-4 leading-relaxed">{description}</p>

        {/* Reason textarea */}
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Motivul ștergerii (obligatoriu)..."
          rows={3}
          className="w-full rounded-xl border border-white/15 bg-white/5 text-sm text-white placeholder-white/30 px-3 py-2.5 resize-none focus:outline-none focus:border-brand-green/40 transition-colors"
        />

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel}
            className="flex-1 h-11 rounded-2xl border border-white/15 text-sm text-white/60 font-semibold hover:bg-white/5 transition-colors">
            Anulează
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="flex-1 h-11 rounded-2xl text-sm font-bold text-white transition-colors disabled:opacity-30"
            style={{ backgroundColor: '#EF4444' }}
          >
            Șterge
          </button>
        </div>
      </div>
    </div>
  )
}
