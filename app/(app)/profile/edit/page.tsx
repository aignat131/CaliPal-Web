'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateProfile, updateEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider,
} from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { db, getUserDoc, updateUserDoc } from '@/lib/firebase/firestore'
import { uploadProfilePhoto } from '@/lib/firebase/storage'
import { propagateDisplayName } from '@/lib/firebase/propagateName'
import { useAuth } from '@/lib/hooks/useAuth'
import { ArrowLeft, Camera, ChevronDown, ChevronUp } from 'lucide-react'
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

  // Email change
  const [showEmailSection, setShowEmailSection] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const isPasswordUser = user?.providerData.some(p => p.providerId === 'password') ?? false

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
    if (file.size > 5 * 1024 * 1024) {
      setError(t('edit.error_size'))
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

  async function handleEmailChange() {
    if (!user || !newEmail.trim() || !emailPassword) return
    setEmailSaving(true)
    setEmailError('')
    setEmailSuccess(false)
    try {
      const credential = EmailAuthProvider.credential(user.email!, emailPassword)
      await reauthenticateWithCredential(user, credential)
      await updateEmail(user, newEmail.trim())
      await updateUserDoc(user.uid, { email: newEmail.trim() })
      setEmailSuccess(true)
      setNewEmail('')
      setEmailPassword('')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setEmailError('Parola introdusă este incorectă.')
      } else if (code === 'auth/email-already-in-use') {
        setEmailError('Acest email este deja folosit de un alt cont.')
      } else if (code === 'auth/invalid-email') {
        setEmailError('Adresa de email nu este validă.')
      } else {
        setEmailError('A apărut o eroare. Încearcă din nou.')
      }
    } finally {
      setEmailSaving(false)
    }
  }

  async function handlePasswordChange() {
    if (!user || !currentPassword || !newPassword || !confirmPassword) return
    if (newPassword !== confirmPassword) {
      setPasswordError('Parolele nu coincid.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('Parola trebuie să aibă cel puțin 6 caractere.')
      return
    }
    setPasswordSaving(true)
    setPasswordError('')
    setPasswordSuccess(false)
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError('Parola curentă este incorectă.')
      } else {
        setPasswordError('A apărut o eroare. Încearcă din nou.')
      }
    } finally {
      setPasswordSaving(false)
    }
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
      const trimmedName = name.trim()
      await updateUserDoc(user.uid, {
        displayName: trimmedName,
        bio: bio.trim(),
        photoUrl: finalPhotoUrl,
      })
      await updateProfile(user, { displayName: trimmedName, photoURL: finalPhotoUrl })

      // Sync photo + name to all community member documents
      const userDoc = await getUserDoc(user.uid)
      const communityIds: string[] = userDoc?.joinedCommunityIds ?? []
      await Promise.allSettled(
        communityIds.map(cid =>
          updateDoc(doc(db, 'communities', cid, 'members', user.uid), {
            photoUrl: finalPhotoUrl,
            displayName: trimmedName,
          }).catch(() => {})
        )
      )

      // Fire-and-forget: propagate name/photo to trainings, posts, photos, rsvps
      propagateDisplayName(user.uid, trimmedName, finalPhotoUrl, communityIds).catch(() => {})

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
                style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.20)' }}>
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
              style={{ height: 52, backgroundColor: 'var(--accent)' }}
            >
              {saving
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : t('edit.save')}
            </button>
          </div>

          {/* Account security — only for email/password accounts */}
          {isPasswordUser && (
            <div className="mt-8 flex flex-col gap-3">
              <p className="text-[11px] font-bold text-white/45 tracking-[1.5px]">SECURITATE CONT</p>

              {/* Change email */}
              <div className="rounded-[14px] border border-white/10 overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
                <button
                  onClick={() => { setShowEmailSection(v => !v); setEmailError(''); setEmailSuccess(false) }}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-white/80 hover:bg-white/5 transition-colors"
                >
                  <span>Schimbă email</span>
                  {showEmailSection ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                </button>
                {showEmailSection && (
                  <div className="px-4 pb-4 flex flex-col gap-3 border-t border-white/8">
                    <p className="text-xs text-white/40 pt-3">Email curent: <span className="text-white/60">{user?.email}</span></p>
                    <input
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="Email nou"
                      type="email"
                      className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
                    />
                    <input
                      value={emailPassword}
                      onChange={e => setEmailPassword(e.target.value)}
                      placeholder="Parola curentă (pentru confirmare)"
                      type="password"
                      className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
                    />
                    {emailError && <p className="text-xs text-red-400">{emailError}</p>}
                    {emailSuccess && <p className="text-xs text-brand-green">Email actualizat cu succes!</p>}
                    <button
                      onClick={handleEmailChange}
                      disabled={emailSaving || !newEmail.trim() || !emailPassword}
                      className="w-full h-10 rounded-xl text-sm font-bold text-black disabled:opacity-40 flex items-center justify-center"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {emailSaving ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : 'Actualizează email'}
                    </button>
                  </div>
                )}
              </div>

              {/* Change password */}
              <div className="rounded-[14px] border border-white/10 overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
                <button
                  onClick={() => { setShowPasswordSection(v => !v); setPasswordError(''); setPasswordSuccess(false) }}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-white/80 hover:bg-white/5 transition-colors"
                >
                  <span>Schimbă parola</span>
                  {showPasswordSection ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                </button>
                {showPasswordSection && (
                  <div className="px-4 pb-4 flex flex-col gap-3 border-t border-white/8">
                    <div className="pt-3" />
                    <input
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Parola curentă"
                      type="password"
                      className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
                    />
                    <input
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Parola nouă (min. 6 caractere)"
                      type="password"
                      className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
                    />
                    <input
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Confirmă parola nouă"
                      type="password"
                      className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60"
                    />
                    {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
                    {passwordSuccess && <p className="text-xs text-brand-green">Parolă schimbată cu succes!</p>}
                    <button
                      onClick={handlePasswordChange}
                      disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full h-10 rounded-xl text-sm font-bold text-black disabled:opacity-40 flex items-center justify-center"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {passwordSaving ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : 'Schimbă parola'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
