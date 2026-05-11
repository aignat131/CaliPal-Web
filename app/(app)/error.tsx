'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Log to console in development; swap for an error reporting service in production
    console.error('[CaliPal error boundary]', error)
  }, [error])

  return (
    <div
      className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--app-bg)' }}
    >
      <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-5">
        <AlertTriangle size={28} className="text-red-400" />
      </div>

      <h2 className="text-lg font-black text-white mb-2 text-center">A apărut o eroare</h2>
      <p className="text-sm text-white/45 text-center mb-8 max-w-xs">
        {error.message ?? 'Ceva nu a mers bine. Încearcă din nou.'}
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={reset}
          className="w-full h-12 rounded-2xl bg-brand-green text-black font-black text-sm flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Încearcă din nou
        </button>
        <button
          onClick={() => router.push('/home')}
          className="w-full h-12 rounded-2xl border border-white/15 text-white/70 font-semibold text-sm flex items-center justify-center gap-2"
        >
          <ArrowLeft size={16} />
          Înapoi acasă
        </button>
      </div>
    </div>
  )
}
