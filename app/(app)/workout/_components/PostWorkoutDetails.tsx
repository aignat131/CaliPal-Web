'use client'

import { useRef, useState } from 'react'
import { X, ImagePlus, Share2 } from 'lucide-react'
import type { WorkoutExercise } from '@/types'
import { formatDuration, totalRepsInWorkout, exerciseOneLiner } from '../_helpers'

export function PostWorkoutDetails({
  exercises,
  seconds,
  onSave,
  onShare,
  hasJoinedCommunities,
}: {
  exercises: WorkoutExercise[]
  seconds: number
  onSave: (photoFile: File | null, description: string) => void
  onShare: (photoFile: File | null, description: string) => void
  hasJoinedCommunities: boolean
}) {
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const totalReps = totalRepsInWorkout(exercises)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--app-bg)' }}>

      {/* Top bar */}
      <div className="flex-shrink-0 px-5 pt-12 pb-5 border-b border-white/8">
        <h2 className="text-2xl font-black text-white mb-1">Cum a mers?</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-white/40">⏱ {formatDuration(seconds)}</span>
          <span className="text-white/20">·</span>
          <span className="text-xs font-semibold text-white/40">🔁 {totalReps} rep</span>
          <span className="text-white/20">·</span>
          <span className="text-xs font-semibold text-white/40">{exercises.length} exerciți{exercises.length === 1 ? 'u' : 'i'}</span>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-sm mx-auto w-full px-5 pt-5 pb-8 flex flex-col">

          {/* Exercise summary */}
          {exercises.length > 0 && (
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
              {exercises.map((ex, i) => (
                <div key={i} className={`px-4 py-2.5 ${i > 0 ? 'border-t border-white/8' : ''}`}>
                  <p className="text-sm text-white/85">{exerciseOneLiner(ex)}</p>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrie antrenamentul..."
            rows={4}
            autoFocus
            className="w-full rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none border border-white/10 bg-white/5 resize-none mb-4"
          />

          {/* Photo picker */}
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="" className="w-full object-cover max-h-52" />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X size={13} className="text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full h-20 rounded-2xl border border-dashed border-white/15 flex items-center justify-center gap-3 text-white/30 mb-5 hover:border-brand-green/35 hover:text-brand-green/50 transition-colors"
            >
              <ImagePlus size={18} />
              <span className="text-sm">Adaugă o fotografie</span>
            </button>
          )}

          {/* Actions */}
          <button
            onClick={() => onSave(photoFile, description)}
            className="w-full rounded-full font-black text-black bg-brand-green mb-3"
            style={{ height: 52 }}
          >
            Salvează
          </button>
          {hasJoinedCommunities && (
            <button
              onClick={() => onShare(photoFile, description)}
              className="w-full rounded-full font-bold border border-white/20 text-white/70 flex items-center justify-center gap-2"
              style={{ height: 48 }}
            >
              <Share2 size={16} /> Postează în comunitate
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
