'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Video, Square, Scissors, Download } from 'lucide-react'
import { RepCounter, STATE_LABELS, STATE_COLORS } from '@/lib/ml/rep-counter'
import { avgElbowAngle, MP } from '@/lib/ml/pose-math'
import type { Landmark } from '@/lib/ml/pose-math'
import type { RepState } from '@/lib/ml/rep-counter'

interface RepSegment {
  startMs: number
  endMs: number
  rep: number
}

type Status = 'idle' | 'loading' | 'recording' | 'processing' | 'done' | 'error'

export default function AutoCutPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const animRef = useRef<number | null>(null)
  const detectorRef = useRef<unknown>(null)
  const repCounterRef = useRef(new RepCounter())
  const repSegmentsRef = useRef<RepSegment[]>([])
  const recordingStartRef = useRef<number>(0)
  const lastRepCountRef = useRef(0)
  const lastRepStartRef = useRef(0)

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [repCount, setRepCount] = useState(0)
  const [repState, setRepState] = useState<RepState>('IDLE')
  const [recordingMs, setRecordingMs] = useState(0)
  const [segments, setSegments] = useState<RepSegment[]>([])
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAll = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  async function startRecording() {
    setStatus('loading')
    setError('')
    setRepCount(0)
    setRepState('IDLE')
    setRecordingMs(0)
    setSegments([])
    setOutputUrl(null)
    repCounterRef.current.reset()
    repSegmentsRef.current = []
    chunksRef.current = []
    lastRepCountRef.current = 0

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // MediaPipe
      const vision = await import('@mediapipe/tasks-vision')
      const { PoseLandmarker, FilesetResolver } = vision
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )
      const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: '/models/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      detectorRef.current = poseLandmarker

      // MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(100) // 100ms chunks
      mediaRecorderRef.current = recorder
      recordingStartRef.current = Date.now()

      timerRef.current = setInterval(() => {
        setRecordingMs(Date.now() - recordingStartRef.current)
      }, 200)

      setStatus('recording')

      let lastTime = -1
      function detect(time: number) {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)

        if (time !== lastTime && video.readyState >= 2) {
          lastTime = time
          const result = (poseLandmarker as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] } }).detectForVideo(video, time)

          if (result.landmarks.length > 0) {
            const lms = result.landmarks[0]
            const elbow = avgElbowAngle(
              lms[MP.LEFT_SHOULDER], lms[MP.LEFT_ELBOW], lms[MP.LEFT_WRIST],
              lms[MP.RIGHT_SHOULDER], lms[MP.RIGHT_ELBOW], lms[MP.RIGHT_WRIST]
            )
            const counterState = repCounterRef.current.update(elbow)

            // New rep completed
            if (counterState.repCount > lastRepCountRef.current) {
              const nowMs = Date.now() - recordingStartRef.current
              repSegmentsRef.current.push({
                startMs: lastRepStartRef.current,
                endMs: nowMs,
                rep: counterState.repCount,
              })
              lastRepStartRef.current = nowMs
              lastRepCountRef.current = counterState.repCount
              setSegments([...repSegmentsRef.current])
            }

            setRepCount(counterState.repCount)
            setRepState(counterState.state)
          }
        }

        animRef.current = requestAnimationFrame(detect)
      }
      animRef.current = requestAnimationFrame(detect)

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Eroare'
      setError(msg.includes('pose_landmarker')
        ? 'Modelul MediaPipe lipsește din public/models/'
        : msg)
      setStatus('error')
    }
  }

  async function stopAndProcess() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setStatus('processing')

    // Stop recorder, wait for all chunks
    await new Promise<void>(resolve => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') { resolve(); return }
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())

    const segs = repSegmentsRef.current
    if (segs.length === 0 || chunksRef.current.length === 0) {
      setError('Nicio repetare detectată. Încearcă din nou.')
      setStatus('error')
      return
    }

    try {
      const fullBlob = new Blob(chunksRef.current, { type: 'video/webm' })

      // Use ffmpeg.wasm to concatenate only the rep segments
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm'),
      })

      await ffmpeg.writeFile('input.webm', await fetchFile(fullBlob))

      // Build a filter_complex concat for detected reps
      const filterParts: string[] = []
      const concatInputs: string[] = []

      segs.forEach((seg, i) => {
        const start = (seg.startMs / 1000).toFixed(3)
        const duration = ((seg.endMs - seg.startMs) / 1000).toFixed(3)
        filterParts.push(`[0:v]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS[v${i}]`)
        concatInputs.push(`[v${i}]`)
      })

      const filterComplex = [
        ...filterParts,
        `${concatInputs.join('')}concat=n=${segs.length}:v=1:a=0[outv]`,
      ].join(';')

      await ffmpeg.exec([
        '-i', 'input.webm',
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-c:v', 'libvpx-vp9',
        'output.webm',
      ])

      const rawData = await ffmpeg.readFile('output.webm')
      const buffer = rawData instanceof Uint8Array
        ? rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength)
        : rawData
      const blob = new Blob([buffer as ArrayBuffer], { type: 'video/webm' })
      setOutputBlob(blob)
      setOutputUrl(URL.createObjectURL(blob))
      setStatus('done')
    } catch {
      // ffmpeg failed — just offer the full video
      const fullBlob = new Blob(chunksRef.current, { type: 'video/webm' })
      setOutputBlob(fullBlob)
      setOutputUrl(URL.createObjectURL(fullBlob))
      setStatus('done')
    }
  }

  function download() {
    if (!outputBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(outputBlob)
    a.download = `calipal_reps_${Date.now()}.webm`
    a.click()
  }

  function formatMs(ms: number) {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  const stateColor = STATE_COLORS[repState] ?? '#6B7280'

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]" style={{ backgroundColor: '#0D1B1A' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
        <button onClick={() => { stopAll(); router.back() }}
          className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center">
          <ArrowLeft size={18} className="text-white/80" />
        </button>
        <h1 className="text-base font-black text-white flex-1">AutoCut Rep</h1>
        {status === 'recording' && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-400 tabular-nums">{formatMs(recordingMs)}</span>
          </div>
        )}
      </div>

      {/* Camera / Result */}
      <div className="relative flex-1 bg-black overflow-hidden">
        {status !== 'done' && (
          <>
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
          </>
        )}

        {status === 'done' && outputUrl && (
          <video src={outputUrl} className="w-full h-full object-contain" controls autoPlay loop />
        )}

        {/* HUD */}
        {status === 'recording' && (
          <>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
              <span className="text-5xl font-black text-white tabular-nums"
                style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>{repCount}</span>
              <p className="text-xs text-white/50 tracking-widest">REPETĂRI</p>
            </div>
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${stateColor}33`, border: `1px solid ${stateColor}66` }}>
              <span className="text-xs font-bold" style={{ color: stateColor }}>{STATE_LABELS[repState]}</span>
            </div>
            {segments.length > 0 && (
              <div className="absolute bottom-4 left-4">
                <p className="text-xs text-white/40 mb-1">Segmente detectate</p>
                <div className="flex gap-1">
                  {segments.map(s => (
                    <div key={s.rep} className="w-6 h-6 rounded bg-brand-green flex items-center justify-center">
                      <span className="text-[9px] font-black text-black">{s.rep}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Overlays */}
        {(status === 'idle' || status === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-brand-green/20 flex items-center justify-center">
                <Scissors size={28} className="text-brand-green" />
              </div>
              <p className="text-white font-bold">AutoCut Rep</p>
              <p className="text-white/45 text-sm">
                Filmează-te executând tracțiuni — videoul va fi tăiat automat la fiecare repetare.
              </p>
              {status === 'error' && <p className="text-red-400 text-sm">⚠️ {error}</p>}
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              <p className="text-white/60 text-sm">Se încarcă camera și modelele...</p>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              <p className="text-white/60 text-sm">Se procesează {segments.length} segmente cu ffmpeg...</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 px-4 py-4 flex gap-3" style={{ backgroundColor: '#0D1B1A' }}>
        {status === 'idle' || status === 'error' ? (
          <button onClick={startRecording}
            className="flex-1 h-12 rounded-2xl bg-brand-green text-black font-black flex items-center justify-center gap-2">
            <Video size={18} /> Începe înregistrarea
          </button>
        ) : status === 'recording' ? (
          <button onClick={stopAndProcess}
            className="flex-1 h-12 rounded-2xl bg-red-500 text-white font-black flex items-center justify-center gap-2">
            <Square size={16} className="fill-white" /> Stop & AutoCut
          </button>
        ) : status === 'done' ? (
          <>
            <button onClick={() => { setStatus('idle'); setOutputUrl(null); setSegments([]); setRepCount(0) }}
              className="flex-1 h-12 rounded-2xl border border-white/20 text-white/70 font-bold text-sm">
              Încearcă din nou
            </button>
            <button onClick={download}
              className="flex-1 h-12 rounded-2xl bg-brand-green text-black font-bold flex items-center justify-center gap-2">
              <Download size={16} /> Descarcă
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
