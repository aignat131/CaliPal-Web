'use client'

import type { ReactNode } from 'react'

export function Section({ title, icon, action, inline, children }: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  /** Render as a sub-section inside another card (no card of its own). */
  inline?: boolean
  children: ReactNode
}) {
  if (inline) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-white/60 flex items-center gap-1.5 flex-1">{icon}{title}</p>
          {action}
        </div>
        {children}
      </div>
    )
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <p className="text-[10px] font-bold text-white/35 tracking-widest flex items-center gap-1.5 flex-1">
          {icon}{title.toUpperCase()}
        </p>
        {action}
      </div>
      <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--app-surface)' }}>
        {children}
      </div>
    </section>
  )
}

export const fieldCls = 'h-10 w-full rounded-xl px-3 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60'
export const areaCls = 'w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none border border-white/12 bg-white/7 focus:border-brand-green/60 resize-none'
