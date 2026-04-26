'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { getUserDoc, updateUserDoc } from '@/lib/firebase/firestore'
import { uploadProfilePhoto } from '@/lib/firebase/storage'
import { useAuth } from '@/lib/hooks/useAuth'
import { ArrowLeft, Camera } from 'lucide-react'

export default function EditProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    getUserDoc(user.uid).then(doc => {
      setName(doc?.displayName ?? user.displayName ?? '')
      setBio(doc?.bio ?? '')
      setPhotoUrl(doc?.photoUrl ?? user.photoURL ?? '')
      setLoading(false)
    })
  }, [user])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleSave() {
    if (!user || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      let finalPhotoUrl = photoUrl
      if (pendingFile) {
        finalPhotoUrl = await uploadProfilePhoto(user.uid, pendingFile)
      }
      await updateUserDoc(user.uid, {
        displayName: name.trim(),
        bio: bio.trim(),
        photoUrl: finalPhotoUrl,
      })
      await updateProfile(user, { displayName: name.trim(), photoURL: finalPhotoUrl })
      router.back()
    } catch {
      setError('A apărut o eroare. Încearcă din nou.')
    } finally {
      setSaving(false)
    }
  }

  const displayUrl = previewUrl || photoUrl
  const initial = (name || 'U').charAt(0).toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/12 transition-colors">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <h1 className="text-lg font-black text-white">Date Personale</h1>
        </div>

        {/* Avatar picker */}
        <div className="flex flex-col items-center mb-7">
          <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: '#1ED75F33' }}>
              {displayUrl
                ? <img src={displayUrl} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-4xl font-black text-brand-green">{initial}</span>}
            </div>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand-green flex items-center justify-center">
              <Camera size={13} className="text-black" />
            </div>
          </div>
          <p className="text-xs text-brand-green mt-2">
            {displayUrl ? 'Schimbă fotografia' : 'Adaugă fotografie'}
          </p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">NUME</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Numele tău"
              className="w-full h-[54px] rounded-[14px] px-4 text-[16px] font-semibold text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8 transition-colors"
            />
          </div>

          <div>
            <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">BIO</p>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Câteva cuvinte despre tine..."
              rows={3}
              className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full h-13 rounded-full font-extrabold text-[15px] text-white disabled:opacity-40 flex items-center justify-center transition-opacity mt-2"
            style={{ height: 52, backgroundColor: '#1DB954' }}
          >
            {saving
              ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  )
}
