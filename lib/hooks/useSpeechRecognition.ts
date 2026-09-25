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
      let finalText = ''
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interimText += r[0].transcript
      }
      if (finalText) setTranscript(prev => `${prev} ${finalText}`.trim())
      setInterim(interimText)
    }
    rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') setError(e.error) }
    rec.onend = () => { recRef.current = null; setListening(false); setInterim('') }
    setError(null)
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
