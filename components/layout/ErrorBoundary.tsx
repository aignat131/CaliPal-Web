'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * App-level React error boundary.
 * Catches unhandled render errors and shows a recovery screen
 * instead of a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: 'var(--app-bg)' }}
        >
          <span className="text-5xl mb-4">⚠️</span>
          <h1 className="text-xl font-black text-white mb-2">Ceva a mers greșit</h1>
          <p className="text-sm text-white/50 mb-8 max-w-xs leading-relaxed">
            A apărut o eroare neașteptată. Încearcă să reîncarci pagina.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="h-[52px] px-8 rounded-full bg-brand-green font-black text-black text-sm"
          >
            Reîncarcă pagina
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
