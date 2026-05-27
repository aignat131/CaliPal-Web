'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  AuthError,
} from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase/auth'
import { ensureUserDoc } from '@/lib/firebase/firestore'
import { useT } from '@/lib/context/LanguageContext'

function authErrorMessage(e: AuthError, t: (key: string) => string): string {
  switch (e.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return t('auth.error_wrong_creds')
    case 'auth/too-many-requests':
      return t('auth.error_too_many')
    case 'auth/network-request-failed':
      return t('auth.error_network')
    default:
      return t('auth.error_generic')
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function LoginPage() {
  const router = useRouter()
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    let valid = true
    setEmailError('')
    setPasswordError('')
    setErrorMessage('')
    if (!email) { setEmailError(t('auth.email_required')); valid = false }
    else if (!isValidEmail(email)) { setEmailError(t('auth.email_invalid')); valid = false }
    if (!password) { setPasswordError(t('auth.password_required')); valid = false }
    return valid
  }

  async function handleLogin() {
    if (!auth) { setErrorMessage(t('auth.firebase_not_configured')); return }
    if (!validate()) return
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      await ensureUserDoc(credential.user)
      router.replace('/home')
    } catch (e) {
      setErrorMessage(authErrorMessage(e as AuthError, t))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!auth) { setErrorMessage(t('auth.firebase_not_configured')); return }
    setLoading(true)
    setErrorMessage('')
    try {
      const result = await signInWithPopup(auth, googleProvider)
      await ensureUserDoc(result.user)
      router.replace('/home')
    } catch (e) {
      setErrorMessage(authErrorMessage(e as AuthError, t))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg min-h-screen flex flex-col items-center justify-center px-7 relative overflow-hidden">

      {/* Blobs */}
      <div className="absolute w-72 h-72 -top-20 -left-20 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #1ED75F50, transparent 70%)' }} />
      <div className="absolute w-60 h-60 bottom-0 right-0 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0D7A3E40, transparent 70%)' }} />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-9">
          <div className="w-20 h-20 rounded-[22px] bg-brand-green/20 flex items-center justify-center mb-3.5">
            <span className="text-4xl">🏋️</span>
          </div>
          <h1 className="text-[26px] font-black text-white tracking-tight">CaliPal</h1>
          <p className="text-[13px] text-white/50 mt-0.5">{t('auth.welcome_back')}</p>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="w-full rounded-xl bg-red-500/15 px-3.5 py-2.5 mb-4">
            <p className="text-[13px] text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* Email */}
        <Field
          label={t('auth.email_label')}
          value={email}
          placeholder="andrei@yahoo.com"
          type="email"
          onChange={setEmail}
          error={emailError}
        />
        <div className="h-3.5" />

        {/* Password */}
        <PasswordField
          label={t('auth.password_label')}
          value={password}
          show={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          onChange={setPassword}
          error={passwordError}
        />

        {/* Forgot */}
        <div className="flex justify-end mt-1 mb-6">
          <Link href="/forgot-password" className="text-xs font-semibold text-brand-green hover:text-brand-green/90">
            {t('auth.forgot_password_link')}
          </Link>
        </div>

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-[52px] rounded-full font-extrabold text-[15px] tracking-wide text-white disabled:opacity-50 transition-opacity flex items-center justify-center bg-brand-green"
        >
          {loading
            ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : t('auth.login_btn')}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs font-bold text-white/30 tracking-widest">{t('auth.or')}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full h-13 rounded-full border border-white/25 flex items-center justify-center gap-2.5 font-bold text-sm text-white/85 hover:bg-white/5 transition-colors disabled:opacity-50"
          style={{ height: 50 }}
        >
          <span className="text-lg font-extrabold text-[#4285F4]">G</span>
          {t('auth.continue_google')}
        </button>

        <div className="h-3" />

        {/* Register */}
        <Link href="/register">
          <button
            className="w-full border border-white/20 rounded-full font-bold text-sm text-white/80 hover:bg-white/5 transition-colors"
            style={{ height: 50 }}
          >
            {t('auth.no_account')}
          </button>
        </Link>

        {/* Security trust strip */}
        <div className="flex items-center justify-center gap-1.5 mt-6">
          <span className="text-brand-green/60 text-xs">🔒</span>
          <p className="text-[10px] font-bold tracking-[1.2px] text-white/30 uppercase">
            {t('auth.secure_strip')}
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, placeholder, type = 'text', onChange, error,
}: {
  label: string; value: string; placeholder: string; type?: string
  onChange: (v: string) => void; error?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={`block text-[11px] font-bold tracking-[1.5px] mb-1.5 ${error ? 'text-red-400' : 'text-white/60'}`}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`w-full h-[54px] rounded-[14px] px-4 text-[17px] font-semibold text-white placeholder:text-white/25 outline-none transition-colors
          ${error
            ? 'border border-red-400 bg-red-500/8'
            : 'border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8'}`}
      />
      {error && <p className="text-[11px] text-red-400 mt-1 ml-1">{error}</p>}
    </div>
  )
}

function PasswordField({
  label, value, show, onToggle, onChange, error,
}: {
  label: string; value: string; show: boolean; onToggle: () => void
  onChange: (v: string) => void; error?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={`block text-[11px] font-bold tracking-[1.5px] mb-1.5 ${error ? 'text-red-400' : 'text-white/60'}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder="••••••••"
          onChange={e => onChange(e.target.value)}
          className={`w-full h-[54px] rounded-[14px] px-4 pr-12 text-[17px] font-semibold text-white placeholder:text-white/25 outline-none transition-colors
            ${error
              ? 'border border-red-400 bg-red-500/8'
              : 'border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8'}`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Ascunde parola' : 'Arată parola'}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400 mt-1 ml-1">{error}</p>}
    </div>
  )
}
