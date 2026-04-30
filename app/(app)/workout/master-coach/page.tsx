'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { useMyProfile } from '@/lib/hooks/useMyProfile'
import { uploadFormCheckVideo } from '@/lib/firebase/storage'
import { ArrowLeft, Check, Star, Video, X } from 'lucide-react'

const COST = 500

export default function MasterCoachPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { profile } = useMyProfile()

  const [exercise, setExercise] = useState('')
  const [notes, setNotes] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null)
  const [videoDurationError, setVideoDurationError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'saving'>('idle')
  const [done, setDone] = useState(false)

  const videoInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const coins = profile?.coins ?? 0
  const canAfford = coins >= COST

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setVideoDurationError('')

    const url = URL.createObjectURL(file)
    const vid = document.createElement('video')
    vid.preload = 'metadata'
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (vid.duration > 30) {
        setVideoDurationError('Videoul trebuie să fie de maximum 30 de secunde.')
        setVideoFile(null)
        setVideoPreviewUrl(null)
        return
      }
      setVideoFile(file)
      setVideoPreviewUrl(URL.createObjectURL(file))
    }
    vid.src = url
  }

  async function submit() {
    if (!user || submitting || !exercise.trim() || !canAfford) return
    setSubmitting(true)
    try {
      let videoUrl: string | null = null
      if (videoFile) {
        setUploadProgress('uploading')
        videoUrl = await uploadFormCheckVideo(user.uid, Date.now(), videoFile)
      }
      setUploadProgress('saving')

      await addDoc(collection(db, 'form_check_requests'), {
        userId: user.uid,
        userName: profile?.displayName || user.displayName || '',
        exerciseName: exercise.trim(),
        notes: notes.trim(),
        ...(videoUrl && { videoUrl }),
        status: 'PENDING',
        coinsSpent: COST,
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'users', user.uid), { coins: increment(-COST) })
      setDone(true)
    } finally {
      setSubmitting(false)
      setUploadProgress('idle')
    }
  }

  if (done) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mb-5">
          <Check size={40} className="text-black" strokeWidth={3} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">Cerere trimisă!</h2>
        <p className="text-sm text-white/55 leading-relaxed mb-8 max-w-xs">
          Un Master Coach va analiza forma ta și va trimite feedback personalizat în curând.
        </p>
        <button
          onClick={() => router.back()}
          className="h-12 px-8 rounded-full bg-brand-green text-black font-bold text-sm"
        >
          Înapoi
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)]" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="max-w-lg mx-auto px-4 pt-5 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0"
          >
            <ArrowLeft size={16} className="text-white/70" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <Star size={18} className="text-yellow-400" /> Master Coach
            </h1>
            <p className="text-xs text-white/40">Analiză formă personalizată</p>
          </div>
          <div className="ml-auto text-sm font-black text-yellow-400">{COST} 🪙</div>
        </div>

        {/* Coins balance */}
        <div
          className="rounded-2xl p-4 mb-5 flex items-center justify-between"
          style={{ backgroundColor: 'var(--app-surface)' }}
        >
          <div>
            <p className="text-xs text-white/40 mb-0.5">Soldul tău</p>
            <p className={`text-xl font-black ${canAfford ? 'text-white' : 'text-red-400'}`}>
              {coins} 🪙
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40 mb-0.5">Cost</p>
            <p className="text-xl font-black text-yellow-400">{COST} 🪙</p>
          </div>
        </div>

        {!canAfford && (
          <div className="rounded-xl p-3 mb-4 border border-red-400/25 bg-red-400/10">
            <p className="text-xs text-red-400">
              Monede insuficiente. Completează antrenamente pentru a câștiga monede.
            </p>
          </div>
        )}

        {/* Exercise name */}
        <div className="mb-4">
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">EXERCIȚIU *</p>
          <input
            value={exercise}
            onChange={e => setExercise(e.target.value)}
            placeholder="ex. Tracțiuni, Flotări, Squat..."
            className="w-full h-11 rounded-xl px-4 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors"
          />
        </div>

        {/* Video upload */}
        <div className="mb-4">
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">VIDEO (MAX 30 SEC)</p>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleVideoChange}
          />

          {videoPreviewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={videoPreviewUrl}
                controls
                className="w-full max-h-64 object-contain"
              />
              <button
                onClick={() => { setVideoFile(null); setVideoPreviewUrl(null) }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center"
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => videoInputRef.current?.click()}
              className="w-full h-28 rounded-2xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/35 hover:border-yellow-400/40 hover:text-yellow-400/60 transition-colors"
            >
              <Video size={24} />
              <span className="text-sm">Adaugă un video</span>
              <span className="text-xs opacity-60">opțional · max 30 secunde</span>
            </button>
          )}

          {videoDurationError && (
            <p className="text-xs text-red-400 mt-2 px-1">{videoDurationError}</p>
          )}
        </div>

        {/* Notes */}
        <div className="mb-6">
          <p className="text-[10px] font-bold text-white/40 tracking-widest mb-2">NOTE (OPȚIONAL)</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Descrie ce vrei să îmbunătățești sau ce simți că nu e corect..."
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none border border-white/12 bg-white/7 focus:border-brand-green/50 transition-colors resize-none"
          />
        </div>

        {/* Info */}
        <p className="text-xs text-white/30 leading-relaxed mb-5 px-1">
          Un antrenor certificat va vizualiza videoul, analiza forma și va trimite feedback detaliat în cel mai scurt timp.
        </p>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={submitting || !exercise.trim() || !canAfford}
          className="w-full h-14 rounded-2xl font-black text-black bg-brand-green disabled:opacity-40 disabled:cursor-not-allowed text-base"
        >
          {submitting
            ? uploadProgress === 'uploading'
              ? '⏳ Se încarcă videoul...'
              : '💾 Se salvează...'
            : `Solicită analiză · ${COST} 🪙`}
        </button>
      </div>
    </div>
  )
}
