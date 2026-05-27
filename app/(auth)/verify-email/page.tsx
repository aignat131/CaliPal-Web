'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sendEmailVerification, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/lib/hooks/useAuth'

export default function VerifyEmailPage() {
  const { user } = useAuth()
  const [resent, setResent] = useState(false)
  const [error, setError] = useState('')

  async function handleResend() {
    if (!user || resent) return
    setError('')
    try {
      await sendEmailVerification(user)
      setResent(true)
    } catch {
      setError('Retrimite a eșuat. Încearcă din nou.')
    }
  }

  async function handleSignOut() {
    await signOut(auth)
  }

  return (
    <div className="auth-bg min-h-screen flex flex-col items-center justify-center px-7 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute w-72 h-72 -top-20 -left-20 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #1ED75F50, transparent 70%)' }} />
      <div className="absolute w-60 h-60 bottom-0 right-0 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0D7A3E40, transparent 70%)' }} />

      <div className="relative w-full max-w-sm flex flex-col items-center text-center">
        <div className="w-[88px] h-[88px] rounded-full bg-brand-green/15 flex items-center justify-center mb-6">
          <span className="text-[36px]">✉️</span>
        </div>

        <h1 className="text-[26px] font-black text-white tracking-tight mb-3">Verifică emailul</h1>

        <p className="text-[14px] text-white/55 leading-relaxed mb-2">
          Am trimis un link de verificare la
        </p>
        {user?.email && (
          <span className="px-4 py-1.5 rounded-full bg-brand-green/15 text-brand-green text-[13px] font-bold mb-6">
            {user.email}
          </span>
        )}

        <p className="text-[13px] text-white/40 leading-relaxed mb-8">
          Dacă nu găsești emailul, verifică folderul Spam sau trimite din nou.
        </p>

        {error && (
          <div className="rounded-xl bg-red-500/15 px-3.5 py-2.5 mb-4 w-full">
            <p className="text-[13px] text-red-400">{error}</p>
          </div>
        )}

        <Link href="/home" className="w-full mb-3">
          <button className="w-full h-[52px] rounded-full bg-brand-green font-extrabold text-[15px] text-black">
            Continuă oricum
          </button>
        </Link>

        <div className="flex items-center gap-1.5 mb-8">
          <span className="text-[13px] text-white/35">Nu ai primit emailul?</span>
          <button
            onClick={handleResend}
            className={`text-[13px] font-bold transition-colors ${resent ? 'text-brand-green' : 'text-brand-green/80 hover:text-brand-green'}`}
          >
            {resent ? 'Trimis ✓' : 'Retrimite'}
          </button>
        </div>

        <button
          onClick={handleSignOut}
          className="text-[13px] text-white/30 hover:text-white/50 transition-colors"
        >
          Deconectează-te
        </button>
      </div>
    </div>
  )
}
