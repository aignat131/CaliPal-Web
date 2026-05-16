'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from 'firebase/auth'
import { getUserDoc, updateUserDoc } from '@/lib/firebase/firestore'
import { uploadProfilePhoto } from '@/lib/firebase/storage'
import { useAuth } from '@/lib/hooks/useAuth'
import { ArrowLeft, Camera } from 'lucide-react'
import ImageCropModal from '@/components/ui/ImageCropModal'
import { useT } from '@/lib/context/LanguageContext'

export default function EditProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
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

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview) }
  }, [pendingPreview])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''  // allow re-selecting same file
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      setError(t('edit.error_file'))
      return
    }
    setError('')
    // Open crop modal
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  function handleCropConfirm(croppedFile: File) {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    const preview = URL.createObjectURL(croppedFile)
    setPendingFile(croppedFile)
    setPendingPreview(preview)
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
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
      setError(t('edit.error_save'))
    } finally {
      setSaving(false)
    }
  }

  const displayUrl = pendingPreview || photoUrl
  const initial = (name || 'U').charAt(0).toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="max-w-sm mx-auto px-4 pt-5 pb-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.back()} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/12 transition-colors">
              <ArrowLeft size={18} className="text-white/80" />
            </button>
            <h1 className="text-lg font-black text-white">{t('edit.title')}</h1>
          </div>

          {/* Avatar picker */}
          <div className="flex flex-col items-center mb-7">
            <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
              <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: '#1ED75F33' }}>
                {displayUrl
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={displayUrl} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-4xl font-black text-brand-green">{initial}</span>}
              </div>
              <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand-green flex items-center justify-center">
                <Camera size={13} className="text-black" />
              </div>
            </div>
            <p className="text-xs text-brand-green mt-2">
              {displayUrl ? t('edit.change_photo') : t('edit.add_photo')}
            </p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">{t('edit.name_label')}</p>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('edit.name_placeholder')}
                className="w-full h-[54px] rounded-[14px] px-4 text-[16px] font-semibold text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8 transition-colors"
              />
            </div>

            <div>
              <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">{t('edit.bio_label')}</p>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder={t('edit.bio_placeholder')}
                rows={3}
                className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8 transition-colors resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full h-13 rounded-full font-extrabold text-[15px] text-white disabled:opacity-40 flex items-center justify-center transition-opacity mt-2"
              style={{ height: 52, backgroundColor: '#1ED75F' }}
            >
              {saving
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : t('edit.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
