'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, CheckCircle, Star, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'
import { useT } from '@/lib/context/LanguageContext'

export default function FeedbackPage() {
  const router = useRouter()
  const { user } = useAuth()
  const t = useT()

  const CATEGORIES = [
    { id: 'improvement', label: t('feedback.cat_improvement'),  desc: t('feedback.cat_improvement_desc') },
    { id: 'feedback',    label: t('feedback.cat_feedback'),     desc: t('feedback.cat_feedback_desc') },
    { id: 'bug',         label: t('feedback.cat_bug'),          desc: t('feedback.cat_bug_desc') },
    { id: 'other',       label: t('feedback.cat_other'),        desc: t('feedback.cat_other_desc') },
  ]

  const RATING_LABELS = [
    '',
    t('feedback.rating_poor'),
    t('feedback.rating_fair'),
    t('feedback.rating_good'),
    t('feedback.rating_great'),
    t('feedback.rating_excellent'),
  ]

  const [category, setCategory] = useState<string>('feedback')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Rate limit state
  const [weekCount, setWeekCount] = useState(0)
  const [canSendToday, setCanSendToday] = useState(true)
  const [rateLoading, setRateLoading] = useState(true)

  // Fetch current rate counts on mount
  useEffect(() => {
    if (!user) return
    auth.currentUser?.getIdToken().then(idToken => {
      fetch('/api/email/feedback', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            setWeekCount(data.weekCount)
            setCanSendToday(data.canSendToday)
          }
        })
        .catch(() => {})
        .finally(() => setRateLoading(false))
    })
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !message.trim() || !user) return
    setSending(true)
    setError('')

    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/email/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          rating: rating > 0 ? rating : undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'daily-limit')  { setError(t('feedback.error_daily_limit'));  return }
        if (data.reason === 'weekly-limit') { setError(t('feedback.error_weekly_limit')); return }
        throw new Error(data.reason ?? 'send-failed')
      }
      // Update local rate state
      setWeekCount(data.weekCount)
      setCanSendToday(false)
      setSent(true)
    } catch (err) {
      setError(t('feedback.error'))
      console.error('[feedback] send error:', err)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#1ED75F18', border: '1px solid #1ED75F40' }}>
            <CheckCircle size={36} className="text-brand-green" />
          </div>
          <h2 className="text-xl font-black text-white">{t('feedback.success_title')}</h2>
          <p className="text-sm text-white/55 leading-relaxed">{t('feedback.success_text')}</p>
          <button
            onClick={() => router.back()}
            className="mt-2 h-11 px-6 rounded-2xl font-bold text-sm text-black"
            style={{ backgroundColor: '#1ED75F' }}
          >
            {t('feedback.success_back')}
          </button>
        </div>
      </div>
    )
  }

  // Hard blocked for the week
  if (!rateLoading && weekCount >= 3) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#F9731618', border: '1px solid #F9731640' }}>
            <AlertTriangle size={36} className="text-orange-400" />
          </div>
          <h2 className="text-xl font-black text-white">{t('feedback.limit_title')}</h2>
          <p className="text-sm text-white/55 leading-relaxed">{t('feedback.limit_text')}</p>
          <button onClick={() => router.back()}
            className="mt-2 h-11 px-6 rounded-2xl font-bold text-sm border border-white/15 text-white/70">
            {t('feedback.success_back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-12">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft size={18} className="text-white/80" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white leading-tight">{t('feedback.title')}</h1>
            <p className="text-xs text-white/40">{t('feedback.subtitle')}</p>
          </div>
        </div>

        {/* Warning: 1 message left this week */}
        {!rateLoading && weekCount === 2 && (
          <div className="flex items-start gap-3 p-3.5 rounded-2xl mb-5 border border-orange-500/30"
            style={{ backgroundColor: '#F9731610' }}>
            <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-orange-300 leading-relaxed">{t('feedback.warning_last_message')}</p>
          </div>
        )}

        {/* Daily limit hit (but week not exhausted) */}
        {!rateLoading && !canSendToday && weekCount < 3 && (
          <div className="flex items-start gap-3 p-3.5 rounded-2xl mb-5 border border-white/10"
            style={{ backgroundColor: 'var(--app-surface)' }}>
            <AlertTriangle size={16} className="text-white/40 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/50 leading-relaxed">{t('feedback.error_daily_limit')}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Category picker */}
          <div>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('feedback.section_category')}</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`rounded-2xl p-3 text-left transition-all ${
                    category === cat.id
                      ? 'border border-brand-green/60'
                      : 'border border-white/10'
                  }`}
                  style={{
                    backgroundColor: category === cat.id ? '#1ED75F12' : 'var(--app-surface)',
                  }}
                >
                  <p className="text-sm font-bold text-white leading-tight">{cat.label}</p>
                  <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{cat.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('feedback.section_subject')}</p>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={t('feedback.subject_placeholder')}
              maxLength={120}
              required
              className="w-full h-11 px-4 rounded-2xl text-sm text-white placeholder-white/30 outline-none"
              style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Message */}
          <div>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('feedback.section_message')}</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('feedback.message_placeholder')}
              maxLength={2000}
              required
              rows={6}
              className="w-full px-4 py-3 rounded-2xl text-sm text-white placeholder-white/30 outline-none resize-none leading-relaxed"
              style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <p className="text-[11px] text-white/25 text-right mt-1 px-1">{message.length}/2000</p>
          </div>

          {/* Star rating */}
          <div>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">{t('feedback.section_rating')}</p>
            <div className="flex gap-2 px-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n === rating ? 0 : n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  <Star
                    size={28}
                    className="transition-colors"
                    style={{
                      color: n <= (hoverRating || rating) ? '#FFB800' : 'rgba(255,255,255,0.15)',
                      fill:  n <= (hoverRating || rating) ? '#FFB800' : 'transparent',
                    }}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="text-xs text-white/35 self-center ml-1">
                  {RATING_LABELS[rating]}
                </span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 px-1">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={sending || !subject.trim() || !message.trim() || !canSendToday || weekCount >= 3}
            className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#1ED75F', color: '#000' }}
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send size={15} />
                {t('feedback.send')}
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  )
}
