'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal Web Speech API typings (not shipped in every TS lib.dom version)
interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Join result pieces, collapsing progressive repeats. Chrome on Android emits the growing
 * utterance as separate results ("Deci", "Deci am", "Deci am băgat"…), often all flagged final.
 */
function collapse(pieces: string[]): string {
  const out: string[] = []
  for (const raw of pieces) {
    const p = raw.trim()
    if (!p) continue
    const last = out[out.length - 1]
    if (last !== undefined && p.toLowerCase().startsWith(last.toLowerCase())) out[out.length - 1] = p
    else if (last !== undefined && last.toLowerCase().startsWith(p.toLowerCase())) continue
    else out.push(p)
  }
  return out.join(' ')
}

/**
 * Browser speech-to-text. `transcript` accumulates final results across the session;
 * `interim` holds the words currently being recognised.
 */
export function useSpeechRecognition(lang: string) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef('')
  const baseRef = useRef('')        // transcript before the current recognition session

  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  useEffect(() => { setSupported(getCtor() !== null) }, [])

  useEffect(() => () => { recRef.current?.abort() }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor || recRef.current) return
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = e => {
      // Rebuild from the whole results list every time instead of appending, so re-emitted
      // or progressively growing results can't pile up.
      const finals: string[] = []
      const interims: string[] = []
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        ;(r.isFinal ? finals : interims).push(r[0].transcript)
      }
      const finalText = collapse(finals)
      const full = collapse([...finals, ...interims])
      const interimText = full.toLowerCase().startsWith(finalText.toLowerCase())
        ? full.slice(finalText.length).trim()
        : collapse(interims)
      setTranscript(`${baseRef.current} ${finalText}`.trim())
      setInterim(interimText)
    }
    rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') setError(e.error) }
    rec.onend = () => { recRef.current = null; setListening(false); setInterim('') }
    setError(null)
    baseRef.current = transcriptRef.current
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recRef.current = null
    }
  }, [lang])

  const stop = useCallback(() => { recRef.current?.stop() }, [])

  return { supported, listening, transcript, setTranscript, interim, error, start, stop }
}
