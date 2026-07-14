'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastEntry {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void
}

// ── Context ────────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

// ── Single toast pill ──────────────────────────────────────────────────────────

function ToastPill({ toast, onRemove }: { toast: ToastEntry; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(false)

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss after 3 s
  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>
    const t = setTimeout(() => {
      setVisible(false)
      fadeTimer = setTimeout(() => onRemove(toast.id), 300)
    }, 3000)
    return () => { clearTimeout(t); clearTimeout(fadeTimer) }
  }, [toast.id, onRemove])

  const isSuccess = toast.variant === 'success'
  const isError   = toast.variant === 'error'

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl transition-all duration-300 max-w-[88vw]"
      style={{
        backgroundColor: isError ? '#1c0a0a' : 'var(--app-surface)',
        border: `1px solid ${isError ? 'rgba(239,68,68,0.35)' : isSuccess ? 'rgba(30,215,95,0.3)' : 'rgba(255,255,255,0.12)'}`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
      }}
    >
      {isSuccess && <CheckCircle size={16} className="text-brand-green flex-shrink-0" />}
      {isError   && <XCircle    size={16} className="text-red-400 flex-shrink-0" />}
      <p className={`text-sm font-semibold leading-snug flex-1 ${isError ? 'text-red-300' : 'text-white'}`}>
        {toast.message}
      </p>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(toast.id), 300) }}
        className="text-white/30 hover:text-white/60 flex-shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const counterRef = useRef(0)

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++counterRef.current
    setToasts(prev => [...prev.slice(-2), { id, message, variant }]) // keep max 3
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast stack — above bottom nav on mobile, bottom-right on desktop */}
      {toasts.length > 0 && (
        <div
          className="fixed z-[700] flex flex-col gap-2 items-center md:items-end pointer-events-none"
          style={{
            bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastPill toast={t} onRemove={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
