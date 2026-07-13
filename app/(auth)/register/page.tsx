'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithCustomToken, sendEmailVerification, signInWithPopup, AuthError } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase/auth'
import { ensureUserDoc } from '@/lib/firebase/firestore'
import { useT } from '@/lib/context/LanguageContext'
import Turnstile from 'react-turnstile'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function authErrorMessage(e: AuthError, t: (key: string) => string): string {
  switch (e.code) {
    case 'auth/email-already-in-use': return t('auth.email_in_use')
    case 'auth/weak-password': return t('auth.password_weak')
    case 'auth/network-request-failed': return t('auth.error_network')
    case 'auth/popup-closed-by-user': return ''
    default: return t('auth.error_generic')
  }
}

const ages = Array.from({ length: 69 }, (_, i) => String(i + 12))

export default function RegisterPage() {
  const router = useRouter()
  const t = useT()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [ageOpen, setAgeOpen] = useState(false)
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  function validate() {
    let valid = true
    setNameError(''); setEmailError(''); setPasswordError(''); setErrorMessage('')
    if (!name.trim()) { setNameError(t('auth.name_required')); valid = false }
    if (!email) { setEmailError(t('auth.email_required')); valid = false }
    else if (!isValidEmail(email)) { setEmailError(t('auth.email_invalid')); valid = false }
    if (!password) { setPasswordError(t('auth.password_required')); valid = false }
    else if (password.length < 8) { setPasswordError(t('auth.password_min_8')); valid = false }
    return valid
  }

  async function handleCreate() {
    if (!validate()) return
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setErrorMessage(t('auth.captcha_required'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: turnstileToken,
          email,
          password,
          displayName: name.trim(),
          gender: gender || undefined,
          age: age || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const reasonMap: Record<string, string> = {
          'email-in-use': t('auth.email_in_use'),
          'weak-password': t('auth.password_weak'),
          'captcha-failed': t('auth.captcha_required'),
          'captcha-required': t('auth.captcha_required'),
        }
        setErrorMessage(reasonMap[data.reason] ?? t('auth.error_generic'))
        return
      }
      const credential = await signInWithCustomToken(auth, data.customToken)
      await sendEmailVerification(credential.user).catch(() => { /* non-critical */ })
      router.replace('/intro')
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
      router.replace('/intro')
    } catch (e) {
      const msg = authErrorMessage(e as AuthError, t)
      if (msg) setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  const genderOptions: [string, string, string][] = [
    ['Masculin', t('auth.male'), '♂'],
    ['Feminin', t('auth.female'), '♀'],
  ]

  return (
    <div
      className="auth-bg min-h-screen relative overflow-hidden"
    >
      {/* Blobs */}
      <div className="absolute w-64 h-64 -top-16 -left-16 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #1ED75F47, transparent 70%)' }} />
      <div className="absolute w-56 h-56 bottom-0 right-0 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0D7A3E38, transparent 70%)' }} />

      <div className="relative max-w-sm mx-auto px-7 pt-14 pb-10 overflow-y-auto min-h-screen">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-[18px] bg-brand-green/20 flex items-center justify-center mb-3">
            <span className="text-2xl">🏋️</span>
          </div>
          <h1 className="text-[22px] font-black text-white tracking-tight">Calipal</h1>
          <p className="text-xs text-white/45">{t('auth.create_account_title')}</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {['bg-brand-green', 'bg-brand-green/50', 'bg-white/15'].map((cls, i) => (
            <div key={i} className={`flex-1 h-0.5 rounded-full ${cls}`} />
          ))}
        </div>

        {/* Google sign-in */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full rounded-full border border-white/25 flex items-center justify-center gap-2.5 font-bold text-sm text-white/85 hover:bg-white/5 transition-colors disabled:opacity-50"
          style={{ height: 50 }}
        >
          <span className="text-lg font-extrabold text-[#4285F4]">G</span>
          {t('auth.continue_google')}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs font-bold text-white/30 tracking-widest">{t('auth.or')}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="rounded-xl bg-red-500/15 px-3.5 py-2.5 mb-4">
            <p className="text-[13px] text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* Section: Personal info */}
        <p className="text-[11px] font-bold text-white/35 tracking-[1.5px] mb-3.5">{t('auth.personal_info')}</p>

        <Field label={t('auth.full_name')} value={name} placeholder="John Doe" type="text" onChange={setName} error={nameError} />
        <div className="h-3" />
        <Field label={t('auth.email_label')} value={email} placeholder="john@yahoo.com" type="email" onChange={setEmail} error={emailError} />
        <div className="h-3" />

        {/* Password */}
        <div>
          <p className={`text-[11px] font-bold tracking-[1.5px] mb-1.5 ${passwordError ? 'text-red-400' : 'text-white/45'}`}>
            {t('auth.password_label')}
          </p>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              placeholder={t('auth.password_min_placeholder')}
              onChange={e => setPassword(e.target.value)}
              className={`w-full h-[54px] rounded-[14px] px-4 pr-12 text-[17px] font-semibold text-white placeholder:text-white/22 outline-none transition-colors
                ${passwordError ? 'border border-red-400 bg-red-500/8' : 'border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8'}`}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-sm">
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {passwordError && <p className="text-[11px] text-red-400 mt-1 ml-1">{passwordError}</p>}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 my-4" />

        {/* Section: Fitness profile */}
        <p className="text-[11px] font-bold text-white/35 tracking-[1.5px] mb-3.5">{t('auth.fitness_profile')}</p>

        {/* Gender */}
        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">{t('auth.gender')}</p>
        <div className="flex gap-2 mb-3">
          {genderOptions.map(([value, label, icon]) => (
            <button
              key={value}
              onClick={() => setGender(value)}
              className={`flex-1 h-[46px] rounded-[14px] font-bold text-sm transition-all border
                ${gender === value
                  ? 'border-brand-green bg-brand-green/15 text-brand-green'
                  : 'border-white/12 bg-white/7 text-white/60 hover:bg-white/10'}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Age */}
        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">{t('auth.age')}</p>
        <div className="relative mb-7">
          <button
            onClick={() => setAgeOpen(!ageOpen)}
            className={`w-full h-12 rounded-[14px] px-3.5 flex items-center justify-between text-sm font-medium transition-all border
              ${ageOpen ? 'border-brand-green/60 bg-brand-green/8' : 'border-white/12 bg-white/7'}
              ${age ? 'text-white' : 'text-white/25'}`}
          >
            <span>{age ? `${age} ${t('auth.years_suffix')}` : t('auth.age_placeholder')}</span>
            <span className="text-xs text-white/40">{ageOpen ? '▲' : '▼'}</span>
          </button>
          {ageOpen && (
            <div className="absolute z-50 w-full mt-1 rounded-[14px] border border-white/10 bg-[#1E2E1E] max-h-48 overflow-y-auto">
              {ages.map(a => (
                <button
                  key={a}
                  onClick={() => { setAge(a); setAgeOpen(false) }}
                  className={`w-full px-3.5 py-2.5 text-sm text-left hover:bg-white/5 transition-colors
                    ${age === a ? 'font-bold text-brand-green' : 'text-white/85'}`}
                >
                  {a} {t('auth.years_suffix')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Turnstile bot protection */}
        {TURNSTILE_SITE_KEY && (
          <div className="flex justify-center mb-1">
            <Turnstile
              sitekey={TURNSTILE_SITE_KEY}
              onVerify={token => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken('')}
              theme="dark"
            />
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={loading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
          className="w-full h-[52px] rounded-full font-extrabold text-[15px] tracking-wide text-white disabled:opacity-40 flex items-center justify-center transition-opacity bg-brand-green"
        >
          {loading
            ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : t('auth.create_btn')}
        </button>

        <div className="h-4" />

        <p className="text-center text-sm text-white/40">
          {t('auth.already_account')}{' '}
          <Link href="/login" className="text-brand-green font-semibold hover:text-brand-green/80">
            {t('auth.login_btn')}
          </Link>
        </p>

        {/* Security trust strip */}
        <div className="flex items-center justify-center gap-1.5 mt-5">
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
        className={`w-full h-[54px] rounded-[14px] px-4 text-[17px] font-semibold text-white placeholder:text-white/22 outline-none transition-colors
          ${error
            ? 'border border-red-400 bg-red-500/8'
            : 'border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8'}`}
      />
      {error && <p className="text-[11px] text-red-400 mt-1 ml-1">{error}</p>}
    </div>
  )
}
