'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useT } from '@/lib/context/LanguageContext'
import { lookupEventByCode } from '@/lib/event/room-codes'

interface Props {
  onClose: () => void
  onJoined: (eventId: string) => void
}

export default function JoinEventSheet({ onClose, onJoined }: Props) {
  const t = useT()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (code.length !== 6 || loading) return
    setLoading(true)
    setError('')
    try {
      const eventId = await lookupEventByCode(code)
      if (!eventId) {
        setError(t('event.not_found'))
        setLoading(false)
        return
      }
      onJoined(eventId)
    } catch {
      setError(t('event.not_found'))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl p-5 animate-[slideUp_0.3s_ease-out]"
        style={{ backgroundColor: 'var(--app-bg)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white/90">{t('event.join')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X size={20} className="text-white/50" />
          </button>
        </div>

        <label className="block text-sm font-medium text-white/60 mb-2">{t('event.room_code')}</label>
        <input
          type="text"
          maxLength={6}
          placeholder="AX7K2M"
          value={code}
          onChange={e => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))
            setError('')
          }}
          onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
          className="w-full h-12 px-4 mb-3 rounded-xl border border-white/15 bg-white/5 text-center text-2xl font-bold tracking-[0.3em] text-white/90 placeholder:text-white/20 focus:border-amber-400/50 outline-none"
          autoFocus
        />

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={code.length !== 6 || loading}
          className="w-full h-11 rounded-xl font-semibold text-black transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : t('event.join_btn')}
        </button>
      </div>
    </div>
  )
}
