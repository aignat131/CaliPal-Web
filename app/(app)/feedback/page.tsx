'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, CheckCircle, Star } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'

const CATEGORIES = [
  { id: 'improvement', label: '💡 Improvement',  desc: 'Suggest a new feature or enhancement' },
  { id: 'feedback',    label: '💬 Feedback',      desc: 'Share your experience with CaliPal' },
  { id: 'bug',         label: '🐛 Bug Report',    desc: 'Something is not working right' },
  { id: 'other',       label: '📝 Other',         desc: 'Anything else on your mind' },
]

export default function FeedbackPage() {
  const router = useRouter()
  const { user } = useAuth()

  const [category, setCategory] = useState<string>('feedback')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
      if (!data.ok) throw new Error(data.reason ?? 'send-failed')
      setSent(true)
    } catch (err) {
      setError('Something went wrong. Please try again.')
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
          <h2 className="text-xl font-black text-white">Thank you!</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Your feedback has been sent. We read every message and use it to make CaliPal better.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-2 h-11 px-6 rounded-2xl font-bold text-sm text-black"
            style={{ backgroundColor: '#1ED75F' }}
          >
            Go back
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
            <h1 className="text-lg font-black text-white leading-tight">Send Feedback</h1>
            <p className="text-xs text-white/40">Help us improve CaliPal</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Category picker */}
          <div>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">CATEGORY</p>
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
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">SUBJECT</p>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief title of your feedback…"
              maxLength={120}
              required
              className="w-full h-11 px-4 rounded-2xl text-sm text-white placeholder-white/30 outline-none"
              style={{ backgroundColor: 'var(--app-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Message */}
          <div>
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">MESSAGE</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe your feedback in detail…"
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
            <p className="text-[10px] font-bold text-white/35 tracking-widest mb-2 px-1">OVERALL RATING (optional)</p>
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
                  {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
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
            disabled={sending || !subject.trim() || !message.trim()}
            className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#1ED75F', color: '#000' }}
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send size={15} />
                Send Feedback
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  )
}
