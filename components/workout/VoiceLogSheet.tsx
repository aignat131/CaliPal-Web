'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Mic, Square, Plus, Trash2, Check, Loader2, RotateCcw } from 'lucide-react'
import type { WorkoutExercise } from '@/types'
import { auth } from '@/lib/firebase/auth'
import { useLanguage } from '@/lib/context/LanguageContext'
import { useSpeechRecognition } from '@/lib/hooks/useSpeechRecognition'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { getCategory, getMetric, type CatalogueEntry } from '@/lib/data/exercise-catalogue'
import { parseWorkoutText, type ParsedExercise, type ParsedWorkout } from '@/lib/voice/parse-workout'

async function parseRemote(text: string, catalogue: CatalogueEntry[]): Promise<ParsedWorkout> {
  const cat = catalogue.map(e => ({ name: e.name, metric: e.metric }))
  const user = auth?.currentUser
  if (!user) return parseWorkoutText(text, cat)
  try {
    const token = await user.getIdToken()
    const res = await fetch('/api/workout/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, catalogue: cat }),
    })
    const data = await res.json()
    if (data?.ok && data.parsed) return data.parsed as ParsedWorkout
  } catch { /* offline — fall back to local parser */ }
  return parseWorkoutText(text, cat)
}

/**
 * Bottom sheet: dictate (or type) a workout, review the parsed sets, confirm.
 * Confirmed sets are tagged `source: 'voice'` so they stay out of leaderboards/challenges.
 */
export default function VoiceLogSheet({
  catalogue,
  onConfirm,
  onClose,
}: {
  catalogue: CatalogueEntry[]
  onConfirm: (exercises: WorkoutExercise[]) => void
  onClose: () => void
}) {
  const { lang, t } = useLanguage()
  const speech = useSpeechRecognition(lang === 'EN' ? 'en-US' : 'ro-RO')
  const [phase, setPhase] = useState<'input' | 'parsing' | 'review'>('input')
  const [items, setItems] = useState<ParsedExercise[]>([])
  const [unrecognized, setUnrecognized] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)

  const text = speech.transcript
  const setText = speech.setTranscript

  // Close on Android/browser back press
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    window.history.pushState({ modal: 'voice-log' }, '')
    const handlePop = () => onCloseRef.current()
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  async function analyze() {
    if (speech.listening) speech.stop()
    const input = `${text} ${speech.interim}`.trim()
    if (!input) return
    setPhase('parsing')
    const parsed = await parseRemote(input, catalogue)
    setItems(parsed.exercises)
    setUnrecognized(parsed.unrecognized)
    setPhase('review')
  }

  function retry() {
    setText('')
    setItems([])
    setUnrecognized([])
    setPhase('input')
  }

  const valueKey = (name: string) => getMetric(name, catalogue) === 'seconds' ? 'durationSeconds' as const : 'reps' as const

  function updateSet(ei: number, si: number, value: number | undefined) {
    setItems(prev => prev.map((ex, i) => i !== ei ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [valueKey(ex.name)]: value }),
    }))
  }
  function addSet(ei: number) {
    setItems(prev => prev.map((ex, i) => i !== ei ? ex : { ...ex, sets: [...ex.sets, { ...ex.sets[ex.sets.length - 1] }] }))
  }
  function removeSet(ei: number, si: number) {
    setItems(prev => prev
      .map((ex, i) => i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) })
      .filter(ex => ex.sets.length > 0))
  }
  function removeExercise(ei: number) {
    setItems(prev => prev.filter((_, i) => i !== ei))
  }

  const incomplete = items.some(ex => ex.sets.some(s => !(s[valueKey(ex.name)] ?? 0)))

  function confirm() {
    if (items.length === 0 || incomplete) return
    onConfirm(items.map(ex => ({
      name: ex.name,
      category: getCategory(ex.name, catalogue),
      sets: ex.sets.map(s => ({ ...s, source: 'voice' as const })),
    })))
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end justify-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('voice.title')}
        className="w-full max-w-lg rounded-t-3xl flex flex-col max-h-[92vh] animate-slide-up"
        style={{ backgroundColor: 'var(--app-surface)', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 flex-shrink-0">
          <p className="font-black text-white text-base">
            {phase === 'review' ? t('voice.review_title') : t('voice.title')}
          </p>
          <button aria-label={t('voice.close')} onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center">
            <X size={14} className="text-white/60" />
          </button>
        </div>

        {phase !== 'review' && (
          <div className="flex-1 overflow-y-auto px-5 pt-5">
            {speech.supported ? (
              <div className="flex flex-col items-center mb-5">
                <button
                  onClick={speech.listening ? speech.stop : speech.start}
                  disabled={phase === 'parsing'}
                  aria-label={speech.listening ? t('voice.stop') : t('voice.tap_to_speak')}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                    speech.listening ? 'bg-red-500 animate-pulse' : 'bg-brand-green'
                  }`}
                >
                  {speech.listening ? <Square size={26} className="text-white" /> : <Mic size={30} className="text-black" />}
                </button>
                <p className="text-xs text-white/50 mt-3">
                  {speech.listening ? t('voice.listening') : t('voice.tap_to_speak')}
                </p>
                {speech.error && <p className="text-xs text-red-400 mt-2">{t('voice.mic_error')}</p>}
              </div>
            ) : (
              <p className="text-xs text-white/50 mb-4">{t('voice.not_supported')}</p>
            )}

            <textarea
              value={speech.interim ? `${text} ${speech.interim}`.trim() : text}
              onChange={e => setText(e.target.value)}
              readOnly={speech.listening}
              placeholder={t('voice.placeholder')}
              rows={3}
              className="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/10 bg-white/5 resize-none"
            />
            <p className="text-[11px] text-white/30 mt-2 mb-5">{t('voice.hint')}</p>
          </div>
        )}

        {phase === 'review' && (
          <div className="flex-1 overflow-y-auto px-5 pt-4">
            <p className="text-[11px] text-white/35 mb-3">
              {t('voice.heard')} <span className="text-white/60 italic">„{text}”</span>
            </p>

            {items.length === 0 && (
              <p className="text-sm text-white/60 py-6 text-center">{t('voice.nothing_found')}</p>
            )}

            {items.map((ex, ei) => {
              const key = valueKey(ex.name)
              return (
                <div key={`${ex.name}-${ei}`} className="rounded-2xl mb-3 p-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm">{ex.name}</p>
                      <p className="text-[10px] text-white/35">
                        {getCategory(ex.name, catalogue)} · {key === 'reps' ? t('voice.unit_reps') : t('voice.unit_secs')}
                      </p>
                    </div>
                    <button onClick={() => removeExercise(ei)} aria-label={t('voice.remove')}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {ex.sets.map((s, si) => {
                    const val = s[key]
                    const missing = !(val ?? 0)
                    return (
                      <div key={si} className="flex items-center gap-3 py-1.5">
                        <span className="w-6 text-[10px] font-black text-white/30 text-center">{si + 1}</span>
                        <input
                          type="number" inputMode="numeric" min={1}
                          value={val ?? ''}
                          onChange={e => updateSet(ei, si, parseInt(e.target.value) || undefined)}
                          onFocus={e => e.target.select()}
                          placeholder={key === 'reps' ? t('voice.missing_reps') : t('voice.missing_secs')}
                          aria-label={`${ex.name} ${si + 1}`}
                          className={`flex-1 h-9 rounded-xl px-3 text-sm font-bold text-white tabular-nums bg-white/5 outline-none border placeholder:text-amber-400/60 placeholder:font-normal ${
                            missing ? 'border-amber-400/60' : 'border-white/10'
                          }`}
                        />
                        <span className="text-xs text-white/40 w-8">{key === 'reps' ? 'rep' : 's'}</span>
                        {(s.weightKg || s.bandKg) ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${s.weightKg ? 'text-orange-400 bg-orange-500/10' : 'text-purple-400 bg-purple-500/10'}`}>
                            {s.weightKg ? `+${s.weightKg}kg` : `~${s.bandKg}kg`}
                          </span>
                        ) : null}
                        <button onClick={() => removeSet(ei, si)} aria-label={t('voice.remove')}
                          className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors">
                          <X size={13} />
                        </button>
                      </div>
                    )
                  })}
                  <button onClick={() => addSet(ei)} className="flex items-center gap-1.5 text-xs text-brand-green font-semibold pt-2">
                    <Plus size={13} /> {t('voice.add_set')}
                  </button>
                </div>
              )
            })}

            {unrecognized.length > 0 && (
              <div className="rounded-2xl px-4 py-3 mb-3 border border-amber-400/25 bg-amber-400/5">
                <p className="text-[11px] font-bold text-amber-400 mb-1">{t('voice.not_understood')}</p>
                {unrecognized.map((u, i) => <p key={i} className="text-xs text-white/50">„{u}”</p>)}
              </div>
            )}

            <p className="text-[11px] text-white/30 mb-4">{t('voice.not_counted')}</p>
          </div>
        )}

        <div className="px-5 pt-3 flex-shrink-0 flex flex-col gap-2">
          {phase === 'review' ? (
            <>
              <button
                onClick={confirm}
                disabled={items.length === 0 || incomplete}
                className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Check size={16} /> {incomplete ? t('voice.fill_missing') : t('voice.confirm', { n: items.length })}
              </button>
              <button onClick={retry} className="w-full py-2.5 text-sm font-semibold text-white/50 flex items-center justify-center gap-1.5">
                <RotateCcw size={13} /> {t('voice.retry')}
              </button>
            </>
          ) : (
            <button
              onClick={analyze}
              disabled={phase === 'parsing' || !`${text} ${speech.interim}`.trim()}
              className="w-full h-12 rounded-2xl bg-brand-green text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {phase === 'parsing' ? <><Loader2 size={16} className="animate-spin" /> {t('voice.analyzing')}</> : t('voice.analyze')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
