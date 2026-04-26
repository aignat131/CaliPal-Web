'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createUserWithEmailAndPassword, updateProfile, AuthError } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { ensureUserDoc } from '@/lib/firebase/firestore'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function authErrorMessage(e: AuthError): string {
  switch (e.code) {
    case 'auth/email-already-in-use': return 'Există deja un cont cu acest email.'
    case 'auth/weak-password': return 'Parola trebuie să aibă cel puțin 6 caractere.'
    case 'auth/network-request-failed': return 'Eroare de rețea. Verifică conexiunea.'
    default: return 'A apărut o eroare. Încearcă din nou.'
  }
}

const ages = Array.from({ length: 69 }, (_, i) => String(i + 12))

export default function RegisterPage() {
  const router = useRouter()
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

  function validate() {
    let valid = true
    setNameError(''); setEmailError(''); setPasswordError(''); setErrorMessage('')
    if (!name.trim()) { setNameError('Numele este obligatoriu.'); valid = false }
    if (!email) { setEmailError('Email-ul este obligatoriu.'); valid = false }
    else if (!isValidEmail(email)) { setEmailError('Email invalid.'); valid = false }
    if (!password) { setPasswordError('Parola este obligatorie.'); valid = false }
    else if (password.length < 8) { setPasswordError('Minim 8 caractere.'); valid = false }
    return valid
  }

  async function handleCreate() {
    if (!validate()) return
    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(credential.user, { displayName: name.trim() })
      await ensureUserDoc({ ...credential.user, displayName: name.trim() })
      router.replace('/home')
    } catch (e) {
      setErrorMessage(authErrorMessage(e as AuthError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F0F0F, #1A2A1A)' }}
    >
      {/* Blobs */}
      <div className="absolute w-64 h-64 -top-16 -left-16 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #1DB95447, transparent 70%)' }} />
      <div className="absolute w-56 h-56 bottom-0 right-0 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0D7A3E38, transparent 70%)' }} />

      <div className="relative max-w-sm mx-auto px-7 pt-14 pb-10 overflow-y-auto min-h-screen">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-[18px] bg-brand-green/20 flex items-center justify-center mb-3">
            <span className="text-2xl">🏋️</span>
          </div>
          <h1 className="text-[22px] font-black text-white tracking-tight">Calipal</h1>
          <p className="text-xs text-white/45">Creează-ți contul gratuit</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {['bg-brand-green', 'bg-brand-green/50', 'bg-white/15'].map((cls, i) => (
            <div key={i} className={`flex-1 h-0.5 rounded-full ${cls}`} />
          ))}
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="rounded-xl bg-red-500/15 px-3.5 py-2.5 mb-4">
            <p className="text-[13px] text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* Section: Informații personale */}
        <p className="text-[11px] font-bold text-white/35 tracking-[1.5px] mb-3.5">INFORMAȚII PERSONALE</p>

        <Field label="NUME COMPLET" value={name} placeholder="John Doe" type="text" onChange={setName} error={nameError} />
        <div className="h-3" />
        <Field label="EMAIL" value={email} placeholder="john@yahoo.com" type="email" onChange={setEmail} error={emailError} />
        <div className="h-3" />

        {/* Password */}
        <div>
          <p className={`text-[11px] font-bold tracking-[1.5px] mb-1.5 ${passwordError ? 'text-red-400' : 'text-white/45'}`}>
            PAROLĂ
          </p>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              placeholder="Minim 8 caractere"
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

        {/* Section: Profil fitness */}
        <p className="text-[11px] font-bold text-white/35 tracking-[1.5px] mb-3.5">PROFIL FITNESS</p>

        {/* Gender */}
        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">GEN</p>
        <div className="flex gap-2 mb-3">
          {[['Masculin', '♂'], ['Feminin', '♀']].map(([g, icon]) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`flex-1 h-[46px] rounded-[14px] font-bold text-sm transition-all border
                ${gender === g
                  ? 'border-brand-green bg-brand-green/15 text-brand-green'
                  : 'border-white/12 bg-white/7 text-white/60 hover:bg-white/10'}`}
            >
              {icon} {g}
            </button>
          ))}
        </div>

        {/* Age */}
        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-1.5">VÂRSTĂ</p>
        <div className="relative mb-7">
          <button
            onClick={() => setAgeOpen(!ageOpen)}
            className={`w-full h-12 rounded-[14px] px-3.5 flex items-center justify-between text-sm font-medium transition-all border
              ${ageOpen ? 'border-brand-green/60 bg-brand-green/8' : 'border-white/12 bg-white/7'}
              ${age ? 'text-white' : 'text-white/25'}`}
          >
            <span>{age ? `${age} ani` : 'Selectează vârsta'}</span>
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
                  {a} ani
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-full font-extrabold text-[15px] tracking-wide text-white disabled:opacity-40 flex items-center justify-center transition-opacity"
          style={{ height: 52, backgroundColor: '#1DB954' }}
        >
          {loading
            ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Creează cont →'}
        </button>

        <div className="h-4" />

        <p className="text-center text-sm text-white/40">
          Ai deja cont?{' '}
          <Link href="/login" className="text-brand-green font-semibold hover:text-brand-green/80">
            Intră în cont
          </Link>
        </p>
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
  return (
    <div>
      <p className={`text-[11px] font-bold tracking-[1.5px] mb-1.5 ${error ? 'text-red-400' : 'text-white/45'}`}>
        {label}
      </p>
      <input
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
