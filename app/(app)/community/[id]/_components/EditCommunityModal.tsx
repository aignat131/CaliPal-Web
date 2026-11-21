'use client'

import { useState, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { uploadCommunityPhoto } from '@/lib/firebase/storage'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import type { CommunityDoc } from '@/types'
import { X, Camera } from 'lucide-react'

export function EditCommunityModal({ community, onClose }: {
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
              style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.09)', border: '2px dashed rgba(var(--accent-rgb), 0.4)' }}
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
              style={{ backgroundColor: 'var(--accent)' }}
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
