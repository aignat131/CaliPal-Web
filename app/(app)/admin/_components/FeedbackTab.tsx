'use client'

import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, addDoc,
  query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import { Plus, Check, X, ChevronRight, Globe, MessageSquare, Send } from 'lucide-react'

interface FeedbackDoc {
  id: string
  uid: string
  senderName: string
  senderEmail: string
  category: string
  subject: string
  message: string
  rating?: number
  communities: string[]
  createdAt: Timestamp | null
  replies: {
    body: string
    lang: 'RO' | 'EN'
    prefix: string
    suffix: string
    sentByEmail: string
    sentAt: string
  }[]
}

const CATEGORY_LABELS: Record<string, string> = {
  improvement: '💡 Îmbunătățire',
  bug:         '🐛 Bug',
  feedback:    '💬 Feedback',
  other:       '📝 Altele',
}
const CATEGORY_COLORS: Record<string, string> = {
  improvement: 'var(--accent)',
  bug:         '#EF4444',
  feedback:    'var(--accent)',
  other:       '#9CA3AF',
}

function formatFeedbackDate(ts: Timestamp | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  return d.toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00b7 ' + d.toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })
}

export function FeedbackTab() {
  const [items, setItems]         = useState<FeedbackDoc[]>([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [replying, setReplying]   = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyLang, setReplyLang] = useState<'RO' | 'EN'>('RO')
  const [sending, setSending]     = useState(false)
  const [sendError, setSendError] = useState('')
  const [sentFor, setSentFor]     = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState<string>('all')

  // Manual entry state
  const [showManual, setShowManual]         = useState(false)
  const [manualName, setManualName]         = useState('')
  const [manualEmail, setManualEmail]       = useState('')
  const [manualSubject, setManualSubject]   = useState('')
  const [manualMessage, setManualMessage]   = useState('')
  const [manualCategory, setManualCategory] = useState('feedback')
  const [manualSaving, setManualSaving]     = useState(false)

  async function saveManualEntry() {
    if (!manualName.trim() || !manualEmail.trim() || !manualSubject.trim() || !manualMessage.trim()) return
    setManualSaving(true)
    try {
      await addDoc(collection(db, 'feedback'), {
        uid: '',
        senderName: manualName.trim(),
        senderEmail: manualEmail.trim(),
        category: manualCategory,
        subject: manualSubject.trim(),
        message: manualMessage.trim(),
        rating: null,
        communities: [],
        replies: [],
        createdAt: serverTimestamp(),
      })
      setShowManual(false)
      setManualName(''); setManualEmail(''); setManualSubject(''); setManualMessage(''); setManualCategory('feedback')
    } finally {
      setManualSaving(false)
    }
  }

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'feedback'), orderBy('createdAt', 'desc')),
      snap => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FeedbackDoc))
        setLoading(false)
      }
    )
    return unsub
  }, [])

  async function sendReply(item: FeedbackDoc) {
    if (!replyBody.trim()) return
    setSending(true)
    setSendError('')
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/email/feedback-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ feedbackId: item.id, replyBody: replyBody.trim(), lang: replyLang }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.reason ?? 'failed')
      setSentFor(item.id)
      setReplying(null)
      setReplyBody('')
    } catch (err) {
      setSendError('Eroare la trimitere. \u00cencearcă din nou.')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const mkPrefixRO = (name: string, subj: string) =>
    `Bun\u0103 ${name},\n\n\u00cei mul\u021fumim c\u0103 ai luat leg\u0103tura cu echipa CaliPal! Apreciem feedback-ul t\u0103u \u015fi ne bucur\u0103m s\u0103-\u021bi oferim cel mai bun suport posibil.\n\nReferitor la mesajul t\u0103u \u201e${subj}\u201d, iat\u0103 r\u0103spunsul nostru:`
  const mkPrefixEN = (name: string, subj: string) =>
    `Hello ${name},\n\nThank you for reaching out to the CaliPal team! We truly appreciate your feedback and are happy to provide you with the best support possible.\n\nRegarding your message "${subj}", here is our response:`
  const SUFFIX_RO = 'Dacă mai ai întrebări sau nelămuriri, nu ezita să ne scrii din nou!\n\nRămâi cât mai puternic și continuă să te antrenezi! 💪\n\nCu drag,\nEchipa CaliPal 🌿'
  const SUFFIX_EN = "If you have any more questions or concerns, don't hesitate to reach out again!\n\nStay as strong as possible and keep training! 💪\n\nWith love,\nThe CaliPal Team 🌿"

  const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat)

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="h-3 bg-white/10 rounded w-1/3 mb-2" />
            <div className="h-4 bg-white/10 rounded w-2/3 mb-2" />
            <div className="h-3 bg-white/10 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Count + category filter + manual button */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-white/40">{items.length} mesaje primite</p>
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1 h-7 px-2.5 rounded-full text-[10px] font-bold bg-white/8 text-white/50 hover:bg-white/12 hover:text-white/70 transition-colors"
          >
            <Plus size={10} /> Manual
          </button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['all', 'improvement', 'bug', 'feedback', 'other'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`h-7 px-2.5 rounded-full text-[10px] font-bold transition-colors ${
                filterCat === cat ? 'bg-brand-green text-black' : 'bg-white/8 text-white/40'
              }`}
            >
              {cat === 'all' ? 'Toate' : CATEGORY_LABELS[cat]?.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <MessageSquare size={40} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/40">Niciun feedback primit</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map(item => {
          const accent = CATEGORY_COLORS[item.category] ?? 'var(--accent)'
          const isOpen = expanded === item.id
          const isReplyOpen = replying === item.id
          const wasSent = sentFor === item.id

          return (
            <div key={item.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
              {/* Card header */}
              <button
                className="w-full text-left px-4 py-3.5 flex items-start gap-3"
                onClick={() => { setExpanded(isOpen ? null : item.id); if (isOpen) setReplying(null) }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: accent }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    {item.replies.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-green/15 text-brand-green">
                        ✓ Răspuns trimis
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-white truncate">{item.subject}</p>
                  <p className="text-xs text-white/40 truncate">{item.senderName} · {item.senderEmail}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.rating != null && item.rating > 0 && (
                      <span className="text-[11px] text-amber-400">
                        {'\u2605'.repeat(item.rating)}{'\u2606'.repeat(5 - item.rating)}
                      </span>
                    )}
                    <span className="text-[11px] text-white/30">{formatFeedbackDate(item.createdAt)}</span>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className={`text-white/25 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-white/6">
                  <div className="mt-3 rounded-xl p-3 mb-3" style={{ backgroundColor: 'var(--app-bg)' }}>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1.5">Mesajul utilizatorului</p>
                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{item.message}</p>
                  </div>

                  {item.communities?.length > 0 && (
                    <p className="text-[11px] text-white/30 mb-3">👥 {item.communities.join(', ')}</p>
                  )}

                  {item.replies.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">Răspunsuri trimise</p>
                      <div className="flex flex-col gap-2">
                        {item.replies.map((r, ri) => (
                          <div key={ri} className="rounded-xl p-3 border border-brand-green/20" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.03)' }}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <Globe size={11} className="text-brand-green" />
                              <span className="text-[10px] font-bold text-brand-green">{r.lang}</span>
                              <span className="text-[10px] text-white/30">
                                {r.sentAt ? new Date(r.sentAt).toLocaleDateString('ro', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/40 italic mb-1 leading-relaxed">{r.prefix.split('\n')[0]}...</p>
                            <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">{r.body}</p>
                            <p className="text-[11px] text-white/40 italic mt-1 leading-relaxed">...{r.suffix.split('\n').slice(-2).join(' ')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isReplyOpen ? (
                    <button
                      onClick={() => { setReplying(item.id); setSentFor(null); setReplyBody(''); setSendError('') }}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-bold text-black"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      <Send size={13} />
                      {wasSent ? 'R\u0103spunde din nou' : 'R\u0103spunde'}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <Globe size={13} className="text-white/40" />
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Limbă email</p>
                        <div className="flex gap-1 ml-auto">
                          {(['RO', 'EN'] as const).map(l => (
                            <button
                              key={l}
                              onClick={() => setReplyLang(l)}
                              className={`h-7 px-3 rounded-full text-[11px] font-bold transition-colors ${
                                replyLang === l ? 'bg-brand-green text-black' : 'bg-white/10 text-white/50'
                              }`}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl p-3 border border-white/8" style={{ backgroundColor: 'var(--app-bg)' }}>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-1">Prefix automat</p>
                        <p className="text-[11px] text-white/40 leading-relaxed whitespace-pre-wrap">
                          {replyLang === 'RO' ? mkPrefixRO(item.senderName, item.subject) : mkPrefixEN(item.senderName, item.subject)}
                        </p>
                      </div>

                      <textarea
                        value={replyBody}
                        onChange={e => setReplyBody(e.target.value)}
                        placeholder={replyLang === 'RO' ? 'Scrie r\u0103spunsul t\u0103u...' : 'Write your reply here...'}
                        rows={5}
                        className="w-full px-4 py-3 rounded-2xl text-sm text-white placeholder-white/25 outline-none resize-none leading-relaxed border border-white/10"
                        style={{ backgroundColor: 'var(--app-surface)' }}
                      />

                      <div className="rounded-xl p-3 border border-white/8" style={{ backgroundColor: 'var(--app-bg)' }}>
                        <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-1">Sufix automat</p>
                        <p className="text-[11px] text-white/40 leading-relaxed whitespace-pre-wrap">
                          {replyLang === 'RO' ? SUFFIX_RO : SUFFIX_EN}
                        </p>
                      </div>

                      {sendError && <p className="text-xs text-red-400">{sendError}</p>}

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setReplying(null); setReplyBody(''); setSendError('') }}
                          className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60"
                        >
                          Anulează
                        </button>
                        <button
                          onClick={() => sendReply(item)}
                          disabled={sending || !replyBody.trim()}
                          className="flex-1 h-10 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2 disabled:opacity-40"
                          style={{ backgroundColor: 'var(--accent)' }}
                        >
                          {sending
                            ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            : <><Send size={13} /> Trimite email</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Manual entry modal */}
      {showManual && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowManual(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-5 pb-8 flex flex-col gap-3"
            style={{ backgroundColor: 'var(--app-bg)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-base font-bold text-white">Adaugă feedback manual</p>
                <p className="text-xs text-white/35">Importă un feedback primit pe email înainte de această funcționalitate</p>
              </div>
              <button
                onClick={() => setShowManual(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Category */}
            <div className="grid grid-cols-4 gap-1.5">
              {(['improvement', 'bug', 'feedback', 'other'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setManualCategory(cat)}
                  className={`h-8 rounded-xl text-[10px] font-bold transition-colors ${
                    manualCategory === cat ? 'text-black' : 'bg-white/8 text-white/40'
                  }`}
                  style={manualCategory === cat ? { backgroundColor: CATEGORY_COLORS[cat] } : {}}
                >
                  {CATEGORY_LABELS[cat]?.split(' ')[0]}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder="Nume utilizator"
              className="w-full h-10 px-4 rounded-2xl text-sm text-white placeholder-white/30 outline-none border border-white/10"
              style={{ backgroundColor: 'var(--app-surface)' }}
            />
            <input
              type="email"
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              placeholder="Email utilizator"
              className="w-full h-10 px-4 rounded-2xl text-sm text-white placeholder-white/30 outline-none border border-white/10"
              style={{ backgroundColor: 'var(--app-surface)' }}
            />
            <input
              type="text"
              value={manualSubject}
              onChange={e => setManualSubject(e.target.value)}
              placeholder="Subiect (din emailul primit)"
              className="w-full h-10 px-4 rounded-2xl text-sm text-white placeholder-white/30 outline-none border border-white/10"
              style={{ backgroundColor: 'var(--app-surface)' }}
            />
            <textarea
              value={manualMessage}
              onChange={e => setManualMessage(e.target.value)}
              placeholder="Mesajul original (copiază din email)"
              rows={4}
              className="w-full px-4 py-3 rounded-2xl text-sm text-white placeholder-white/30 outline-none resize-none border border-white/10"
              style={{ backgroundColor: 'var(--app-surface)' }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowManual(false)}
                className="flex-1 h-10 rounded-xl border border-white/15 text-sm text-white/60"
              >
                Anulează
              </button>
              <button
                onClick={saveManualEntry}
                disabled={manualSaving || !manualName.trim() || !manualEmail.trim() || !manualSubject.trim() || !manualMessage.trim()}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-black flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {manualSaving
                  ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  : <><Check size={13} /> Salvează</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
