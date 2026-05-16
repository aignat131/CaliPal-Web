'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sendPasswordResetEmail, AuthError } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useT } from '@/lib/context/LanguageContext'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function ForgotPasswordPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [resendDone, setResendDone] = useState(false)
  const [resendError, setResendError] = useState('')

  async function handleSend() {
    setErrorMessage('')
    if (!isValidEmail(email)) {
      setErrorMessage(t('auth.invalid_email_error'))
      return
    }
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setEmailSent(true)
    } catch (e) {
      const err = e as AuthError
      if (err.code === 'auth/user-not-found') {
        // Don't reveal if email exists — just show success
        setEmailSent(true)
      } else {
        setErrorMessage(t('auth.error_generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendDone) return
    setResendError('')
    try {
      await sendPasswordResetEmail(auth, email)
      setResendDone(true)
    } catch {
      setResendError(t('auth.resend_failed'))
    }
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F0F0F, #1A2A1A)' }}
    >
      {/* Blobs */}
      <div className="absolute w-64 h-64 -top-16 -left-16 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #1ED75F40, transparent 70%)' }} />
      <div className="absolute w-52 h-52 bottom-0 right-0 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0D7A3E33, transparent 70%)' }} />

      <div className="relative max-w-sm mx-auto px-7 pt-14 pb-10 min-h-screen">
        {/* Back button */}
        <Link href="/login">
          <span className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[14px] bg-white/8 text-[13px] font-semibold text-white/70 hover:text-white/90 transition-colors">
            {t('auth.back_to_login')}
          </span>
        </Link>

        <div className="h-8" />

        {!emailSent ? (
          /* ── Form ── */
          <div>
            {/* Icon */}
            <div className="w-[72px] h-[72px] rounded-[22px] bg-brand-green/18 flex items-center justify-center mb-5">
              <span className="text-[30px]">🔑</span>
            </div>

            <h1 className="text-[26px] font-black text-white tracking-tight mb-2.5">{t('auth.forgot_title')}</h1>
            <p className="text-[14px] text-white/55 leading-relaxed mb-8">
              {t('auth.forgot_desc')}
            </p>

            {/* Error */}
            {errorMessage && (
              <div className="rounded-xl bg-red-500/15 px-3.5 py-2.5 mb-4">
                <p className="text-[13px] text-red-400">{errorMessage}</p>
              </div>
            )}

            <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">{t('auth.email_label')}</p>
            <input
              type="email"
              value={email}
              placeholder="andrei@yahoo.com"
              onChange={e => setEmail(e.target.value)}
              className="w-full h-[54px] rounded-[14px] px-4 text-[17px] font-semibold text-white placeholder:text-white/22 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 focus:bg-brand-green/8 transition-colors"
            />
            <p className="text-xs text-white/35 mt-2 mb-6 leading-relaxed">
              {t('auth.spam_check')}
            </p>

            <button
              onClick={handleSend}
              disabled={loading || !isValidEmail(email)}
              className="w-full rounded-full font-extrabold text-[15px] tracking-wide text-white disabled:opacity-40 flex items-center justify-center transition-opacity"
              style={{ height: 52, backgroundColor: '#1ED75F' }}
            >
              {loading
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : t('auth.send_reset')}
            </button>
          </div>
        ) : (
          /* ── Success ── */
          <div className="flex flex-col items-center pt-8">
            <div className="w-[88px] h-[88px] rounded-full bg-brand-green/15 flex items-center justify-center mb-6">
              <span className="text-[36px]">✉️</span>
            </div>

            <h2 className="text-[26px] font-black text-white tracking-tight mb-3">{t('auth.email_sent_title')}</h2>

            <span className="px-4 py-1.5 rounded-full bg-brand-green/15 text-brand-green text-[13px] font-bold mb-4">
              {email}
            </span>

            <p className="text-[14px] text-white/55 leading-relaxed text-center mb-9">
              {t('auth.email_sent_desc')}
            </p>

            <Link href="/login" className="w-full">
              <button
                className="w-full border border-white/20 rounded-full font-bold text-sm text-white/80 hover:bg-white/5 transition-colors"
                style={{ height: 52 }}
              >
                {t('auth.back_login_btn')}
              </button>
            </Link>

            <div className="h-4" />

            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-white/35">{t('auth.no_email')}</span>
              <button
                onClick={handleResend}
                className={`text-[13px] font-bold transition-colors ${resendDone ? 'text-brand-green' : 'text-brand-green/80 hover:text-brand-green'}`}
              >
                {resendDone ? t('auth.resent') : t('auth.resend')}
              </button>
            </div>
            {resendError && (
              <p className="text-[12px] text-red-400 mt-2 text-center">{resendError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
