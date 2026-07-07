'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { Check, Share2, X } from 'lucide-react'
import type { WorkoutDoc } from '@/types'
import { uploadWorkoutPhoto } from '@/lib/firebase/storage'
import { formatDuration, exerciseOneLiner, circuitSummaryLine, formatCircuitRounds, circuitAverage, circuitTotal } from '../_helpers'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { CoinRewardBanner } from './CoinRewardBanner'

export function WorkoutSummaryCard({
  workout, coinsEarned, onDone, userId, userDisplayName, userPhotoURL,
  joinedCommunityIds, favoriteCommunityId, startedAt, photoFile, autoOpenShare,
}: {
  workout: WorkoutDoc
  coinsEarned: number
  onDone: () => void
  userId: string
  userDisplayName: string
  userPhotoURL?: string | null
  joinedCommunityIds: string[]
  favoriteCommunityId?: string | null
  startedAt: number | null
  photoFile?: File | null
  autoOpenShare?: boolean
}) {
  const router = useRouter()
  const description = workout.note
  const [showShare, setShowShare] = useState(false)
  const sharePanelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sharePanelRef, showShare)
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [selectedCommId, setSelectedCommId] = useState(favoriteCommunityId ?? '')
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [loadingComms, setLoadingComms] = useState(false)
  const [, setUploadingPhoto] = useState(false)

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoFile) return
    const url = URL.createObjectURL(photoFile)
    setPhotoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  useEffect(() => {
    if (autoOpenShare) openShare()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function openShare() {
    if (shared) return
    setShowShare(true)
    if (communities.length > 0 || joinedCommunityIds.length === 0) return
    setLoadingComms(true)
    try {
      const docs = await Promise.all(
        joinedCommunityIds.slice(0, 10).map(id => getDoc(doc(db, 'communities', id)))
      )
      const loaded = docs.filter(d => d.exists()).map(d => ({ id: d.id, name: d.data()!.name as string }))
      setCommunities(loaded)
      if (!selectedCommId && loaded.length > 0) setSelectedCommId(loaded[0].id)
    } finally {
      setLoadingComms(false)
    }
  }

  async function handleShare() {
    if (!selectedCommId || sharing) return
    setSharing(true)
    try {
      let photoUrl: string | null = null
      if (photoFile) {
        setUploadingPhoto(true)
        photoUrl = await uploadWorkoutPhoto(userId, Date.now(), photoFile)
        setUploadingPhoto(false)
      }

      const memberSnap = await getDoc(doc(db, 'communities', selectedCommId, 'members', userId))
      const role = memberSnap.exists() ? memberSnap.data().role : 'MEMBER'
      const _workoutDate = new Date(startedAt ?? Date.now())
      const workoutExercises = workout.exercises.map(ex => ({
        name: ex.name,
        summary: exerciseOneLiner(ex),
      }))
      await addDoc(collection(db, 'communities', selectedCommId, 'posts'), {
        authorId: userId,
        authorName: userDisplayName,
        authorRole: role,
        ...(userPhotoURL && { authorPhotoUrl: userPhotoURL }),
        content: description.trim(),
        workoutNote: description.trim(),
        workoutDuration: workout.durationSeconds,
        workoutReps: workout.totalReps,
        workoutExercises,
        likesCount: 0,
        commentsCount: 0,
        ...(photoUrl && { photoUrl }),
        createdAt: serverTimestamp(),
      })
      setShared(true)
      setShowShare(false)
    } finally {
      setSharing(false)
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ backgroundColor: 'var(--app-bg)' }}>
      {coinsEarned > 0 && <CoinRewardBanner coins={coinsEarned} />}
      <div className="flex-1 max-w-sm mx-auto w-full px-4 py-8 flex flex-col">

        {/* Celebration header */}
        <div className="text-center mb-8 pt-4">
          <div className="relative w-24 h-24 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full bg-brand-green/20 animate-ping" style={{ animationDuration: '1.2s' }} />
            <div className="absolute inset-2 rounded-full bg-brand-green/15 animate-ping" style={{ animationDuration: '1.2s', animationDelay: '0.15s' }} />
            <div className="relative w-24 h-24 rounded-full bg-brand-green flex items-center justify-center animate-pop-in">
              <Check size={44} className="text-black" strokeWidth={3} />
            </div>
          </div>
          <h2 className="text-3xl font-black text-white mb-1.5 animate-fade-in-up">Bravo! 💪</h2>
          <p className="text-white/45 text-sm animate-fade-in-up stagger-1">Antrenament finalizat</p>
        </div>

        {/* Stats row */}
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-black text-white">{formatDuration(workout.durationSeconds)}</p>
              <p className="text-xs text-white/40 mt-0.5">Durată</p>
            </div>
            <div>
              <p className="text-xl font-black text-white">{workout.totalReps}</p>
              <p className="text-xs text-white/40 mt-0.5">Repetări</p>
            </div>
            <div>
              <p className="text-xl font-black text-brand-green">+{coinsEarned}</p>
              <p className="text-xs text-white/40 mt-0.5">Monede 🪙</p>
            </div>
          </div>
          {startedAt && (
            <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-center gap-1.5">
              <span className="text-xs text-white/35">
                🕐 {new Date(startedAt).toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(startedAt + workout.durationSeconds * 1000).toLocaleTimeString('ro', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* Exercise list */}
        {(() => {
          const circuitIndices = new Set<number>()
          workout.circuits?.forEach(c => c.exerciseIndices.forEach(i => circuitIndices.add(i)))
          const regularExercises = workout.exercises.filter((_, i) => !circuitIndices.has(i))
          const timedExercises = workout.exercises.filter(ex => ex.sets.some(s => s.timedDurationSeconds))

          return (
            <>
              {/* Regular exercises */}
              {regularExercises.length > 0 && (
                <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--app-surface)' }}>
                  {regularExercises.map((ex, ei) => (
                    <div key={ei} className={`px-4 py-2.5 ${ei > 0 ? 'border-t border-white/8' : ''}`}>
                      <p className="text-sm text-white/85">{exerciseOneLiner(ex)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Circuits */}
              {workout.circuits && workout.circuits.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-brand-green/60 tracking-widest mb-2 px-1">CIRCUITE</p>
                  {workout.circuits.map((circuit, ci) => (
                    <div key={ci} className="rounded-2xl p-4 mb-2 border border-brand-green/20 bg-brand-green/5">
                      <p className="text-sm font-bold text-white/85 mb-1">
                        {circuitSummaryLine(circuit, workout.exercises)}
                      </p>
                      <p className="text-xs text-white/50 mb-1">
                        {circuit.rounds.length} runde: {formatCircuitRounds(circuit)}
                      </p>
                      <div className="flex gap-4 text-xs text-white/40">
                        <span>Media: {formatDuration(circuitAverage(circuit))}</span>
                        <span>Total: {formatDuration(circuitTotal(circuit))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Timed exercises */}
              {timedExercises.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-cyan-400/60 tracking-widest mb-2 px-1">PE TIMP</p>
                  <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--app-surface)' }}>
                    {timedExercises.map((ex, ei) => (
                      <div key={ei} className={`px-4 py-2.5 ${ei > 0 ? 'border-t border-white/8' : ''}`}>
                        <p className="text-sm text-cyan-400/80">{exerciseOneLiner(ex)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {description.trim() ? (
          <p className="text-sm text-white/60 italic px-1 mb-3">&ldquo;{description.trim()}&rdquo;</p>
        ) : null}

        {photoPreviewUrl && (
          <div className="relative rounded-2xl overflow-hidden mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreviewUrl} alt="" className="w-full object-cover max-h-52" />
          </div>
        )}

        {/* Share */}
        {joinedCommunityIds.length > 0 && !shared && (
          <button
            onClick={openShare}
            className="w-full h-12 rounded-full font-bold border border-white/20 text-white/70 mb-3 flex items-center justify-center gap-2"
          >
            <Share2 size={16} /> Postează în comunitate
          </button>
        )}
        {shared && (
          <p className="text-xs text-brand-green text-center mb-3">✓ Postat în comunitate!</p>
        )}

        <button
          onClick={() => { onDone(); router.push('/home') }}
          className="w-full h-12 rounded-full font-black text-black bg-brand-green mt-2"
        >
          Mergi acasă
        </button>
      </div>

      {showShare && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60">
          <div ref={sharePanelRef} className="w-full max-w-sm rounded-t-3xl px-5 pt-4 pb-8" style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-black text-white">Postează în comunitate</p>
              <button onClick={() => setShowShare(false)} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
                <X size={13} className="text-white/60" />
              </button>
            </div>
            {loadingComms ? (
              <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
            ) : communities.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">Nu ești în nicio comunitate activă.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                {communities.map(c => (
                  <button key={c.id}
                    onClick={() => setSelectedCommId(c.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      selectedCommId === c.id ? 'border-brand-green/50 bg-brand-green/10' : 'border-white/10 bg-white/4'
                    }`}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: selectedCommId === c.id ? 'var(--accent)' : '#ffffff30' }} />
                    <span className="text-sm font-bold text-white">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!loadingComms && communities.length > 0 && (
              <button onClick={handleShare} disabled={sharing || !selectedCommId}
                className="w-full h-11 rounded-xl bg-brand-green text-black text-sm font-black disabled:opacity-40">
                {sharing ? '...' : 'Postează'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
