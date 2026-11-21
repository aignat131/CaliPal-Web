'use client'

import { useState } from 'react'
import { Minus, Plus, Swords, X } from 'lucide-react'
import { useLanguage, useT } from '@/lib/context/LanguageContext'
import { LIFTS, formatRecordValue, type LiftKey, type RecordMap } from '@/lib/gamification/records'
import { DEADLINE_DAYS, createChallenge } from '@/lib/gamification/challenges'

interface Person { uid: string; name: string; photo: string }

/**
 * Bottom sheet to challenge another user. `myRecords` (optional) lets the
 * sender offer "beat my record" as the default target.
 */
export function ChallengeFriendSheet({ me, friend, myRecords, onClose, onSent }: {
  me: Person
  friend: Person
  myRecords?: RecordMap | null
  onClose: () => void
  onSent: () => void
}) {
  const t = useT()
  const { lang } = useLanguage()
  const [lift, setLift] = useState<LiftKey>('pullup')
  const def = LIFTS.find(l => l.key === lift)!
  const myBest = myRecords?.[lift]?.value ?? 0
  const step = def.metric === 'reps' ? 1 : 5
  const defaultTarget = (k: LiftKey) => {
    const d = LIFTS.find(l => l.key === k)!
    const best = myRecords?.[k]?.value ?? 0
    return best > 0 ? Math.round(best) + (d.metric === 'reps' ? 1 : 5) : (d.metric === 'reps' ? 10 : 30)
  }
  const [target, setTarget] = useState(() => defaultTarget('pullup'))
  const [days, setDays] = useState<number>(7)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function pickLift(k: LiftKey) {
    setLift(k)
    setTarget(defaultTarget(k))
  }

  async function send() {
    setSending(true)
    setError('')
    try {
      await createChallenge({ from: me, to: friend, lift, target, days, message: message.trim() })
      onSent()
    } catch {
      setError(t('common.unknown_error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--app-surface)' }} onClick={e => e.stopPropagation()}
        role="dialog" aria-label={t('ch.title_to', { name: friend.name })}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-black text-white flex items-center gap-2">
            <Swords size={17} className="text-[#F97316]" /> {t('ch.title_to', { name: friend.name })}
          </p>
          <button onClick={onClose} aria-label={t('common.close')} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>

        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-2">{t('ch.exercise')}</p>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {LIFTS.map(l => (
            <button key={l.key} onClick={() => pickLift(l.key)}
              className={`h-8 px-2.5 rounded-full text-xs font-bold border flex items-center gap-1 transition-colors ${
                lift === l.key ? 'bg-brand-green text-black border-brand-green' : 'text-white/60 border-white/12'
              }`}>
              <span>{l.icon}</span>{l.name[lang]}
            </button>
          ))}
        </div>

        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-2">
          {def.metric === 'reps' ? t('ch.target_reps') : t('ch.target_secs')}
        </p>
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => setTarget(v => Math.max(1, v - step))} aria-label="-"
            className="w-11 h-11 rounded-xl bg-white/8 flex items-center justify-center"><Minus size={16} className="text-white/70" /></button>
          <input type="number" inputMode="numeric" value={target} min={1} max={def.metric === 'reps' ? 500 : 3600}
            onChange={e => setTarget(Math.max(1, Math.min(def.metric === 'reps' ? 500 : 3600, parseInt(e.target.value) || 1)))}
            className="flex-1 h-11 rounded-xl text-center text-xl font-black text-white bg-white/7 border border-white/12 outline-none focus:border-brand-green/60" />
          <button onClick={() => setTarget(v => v + step)} aria-label="+"
            className="w-11 h-11 rounded-xl bg-white/8 flex items-center justify-center"><Plus size={16} className="text-white/70" /></button>
        </div>
        <p className="text-[11px] text-white/35 mb-5">
          {myBest > 0
            ? t('ch.my_best', { v: `${formatRecordValue(myBest, def.metric)}${def.metric === 'reps' ? ' rep' : ''}` })
            : t('ch.one_set')}
        </p>

        <p className="text-[11px] font-bold text-white/45 tracking-[1.5px] mb-2">{t('ch.deadline')}</p>
        <div className="flex gap-2 mb-5">
          {DEADLINE_DAYS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`flex-1 h-10 rounded-xl text-sm font-bold border transition-colors ${
                days === d ? 'border-brand-green/60 text-brand-green bg-brand-green/10' : 'text-white/55 border-white/12'
              }`}>
              {t('ch.days', { n: String(d) })}
            </button>
          ))}
        </div>

        <input value={message} onChange={e => setMessage(e.target.value)} maxLength={140}
          placeholder={t('ch.message_ph')}
          className="w-full h-11 rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 mb-4" />

        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button onClick={send} disabled={sending}
          className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm disabled:opacity-40">
          {sending ? '...' : t('ch.send')}
        </button>
        <p className="text-[11px] text-white/30 text-center mt-3 leading-relaxed">{t('ch.how')}</p>
      </div>
    </div>
  )
}
