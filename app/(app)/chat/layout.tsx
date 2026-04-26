'use client'

/**
 * Chat layout — split-pane on desktop (md+), stack navigation on mobile.
 *
 * On md+ screens:
 *   Left panel (300px fixed)  → conversation list  (/chat)
 *   Right panel (flex-1)      → message thread     (/chat/[id])
 *
 * On mobile the panels stack normally (router navigates between them).
 */

import { usePathname } from 'next/navigation'
import ChatListPane from './ChatListPane'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isInConversation = pathname !== '/chat'

  return (
    <>
      {/* ── Mobile: just render children (normal stack nav) ── */}
      <div className="md:hidden">
        {children}
      </div>

      {/* ── Desktop: side-by-side panels ── */}
      <div className="hidden md:flex" style={{ height: 'calc(100vh)' }}>
        {/* Left: conversation list */}
        <div
          className="flex-shrink-0 border-r border-white/8 overflow-y-auto"
          style={{ width: 300 }}
        >
          <ChatListPane />
        </div>

        {/* Right: message thread or placeholder */}
        <div className="flex-1 overflow-hidden">
          {isInConversation
            ? children
            : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#1ED75F18' }}
                >
                  <span className="text-3xl">💬</span>
                </div>
                <p className="text-base font-bold text-white/60 mb-1">Selectează o conversație</p>
                <p className="text-sm text-white/30">Alege un prieten din lista din stânga pentru a începe.</p>
              </div>
            )}
        </div>
      </div>
    </>
  )
}
