'use client'

import { useEffect, useRef } from 'react'
import { weekDays, todayKey } from '@/lib/schedule/week'
import { heatIntensity } from '@/lib/schedule/availability'

export interface GridCell { day: number; hour: number }

type EditProps = {
  mode: 'edit'
  isOn: (day: number, hour: number) => boolean
  /** Called for every painted cell (tap, or mouse drag on desktop). */
  onChange: (cells: GridCell[], on: boolean) => void
  disabled?: boolean
}

type HeatProps = {
  mode: 'heat'
  count: (day: number, hour: number) => number
  respondents: number
  selected?: GridCell | null
  onSelect?: (cell: GridCell | null) => void
  /** Cells that already have a session — shown with a dot. */
  marked?: (day: number, hour: number) => boolean
}

type Props = (EditProps | HeatProps) & {
  weekKey: string
  hours: number[]
}

/**
 * Week × hour grid. Sticky hour column + sticky day header; scrolls inside its
 * own box so both stay visible on a 375px phone.
 * - edit: tap toggles; on desktop, press-and-drag paints many cells.
 * - heat: shows counts; tap/hover selects a cell.
 */
export function AvailabilityGrid(props: Props) {
  const { weekKey, hours } = props
  const days = weekDays(weekKey)
  const today = todayKey()

  // ── Drag painting (mouse only — touch keeps native scrolling) ──────────────
  const paintRef = useRef<{ on: boolean; seen: Set<string> } | null>(null)
  const lastPointerType = useRef<string>('')

  useEffect(() => {
    const end = () => { paintRef.current = null }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  function paint(day: number, hour: number) {
    if (props.mode !== 'edit' || !paintRef.current) return
    const k = `${day}:${hour}`
    if (paintRef.current.seen.has(k)) return
    paintRef.current.seen.add(k)
    if (props.isOn(day, hour) !== paintRef.current.on) props.onChange([{ day, hour }], paintRef.current.on)
  }

  function cellHandlers(day: number, hour: number) {
    if (props.mode === 'edit') {
      const { isOn, onChange, disabled } = props
      return {
        onPointerDown: (e: React.PointerEvent) => {
          lastPointerType.current = e.pointerType
          if (disabled || e.pointerType !== 'mouse' || e.button !== 0) return
          e.preventDefault()
          paintRef.current = { on: !isOn(day, hour), seen: new Set() }
          paint(day, hour)
        },
        onPointerEnter: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse' && e.buttons === 1) paint(day, hour)
        },
        onClick: (e: React.MouseEvent) => {
          if (disabled) return
          // Mouse clicks were already handled on pointerdown; keyboard (detail 0) and touch toggle here.
          if (e.detail !== 0 && lastPointerType.current === 'mouse') return
          onChange([{ day, hour }], !isOn(day, hour))
        },
      }
    }
    const { onSelect } = props
    return {
      onClick: () => onSelect?.({ day, hour }),
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') onSelect?.({ day, hour })
      },
    }
  }

  return (
    <div
      className="overflow-auto rounded-2xl max-h-[68dvh] select-none"
      style={{ backgroundColor: 'var(--app-surface)', overscrollBehavior: 'contain' }}
    >
      <table className="border-separate border-spacing-[3px] min-w-full" role="grid">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 w-11 min-w-11" style={{ backgroundColor: 'var(--app-surface)' }} />
            {days.map(d => {
              const isToday = d.dateKey === today
              return (
                <th key={d.dateKey} scope="col"
                  className="sticky top-0 z-20 px-0.5 pt-2 pb-1 font-normal"
                  style={{ backgroundColor: 'var(--app-surface)' }}>
                  <div className={`text-[11px] font-bold leading-tight ${isToday ? 'text-brand-green' : 'text-white/70'}`}>
                    <span className="sm:hidden">{d.short}</span>
                    <span className="hidden sm:inline">{d.name}</span>
                  </div>
                  <div className={`text-[10px] leading-tight ${isToday ? 'text-brand-green/80' : 'text-white/35'}`}>{d.dayMonth}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {hours.map(h => (
            <tr key={h}>
              <th scope="row"
                className="sticky left-0 z-10 pr-1 text-right text-[11px] font-medium text-white/40 tabular-nums"
                style={{ backgroundColor: 'var(--app-surface)' }}>
                {String(h).padStart(2, '0')}:00
              </th>
              {days.map(d => <Cell key={d.dateKey} {...props} day={d.index} hour={h} dayName={d.name} handlers={cellHandlers(d.index, h)} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell(props: Props & {
  day: number; hour: number; dayName: string
  handlers: Record<string, unknown>
}) {
  const { day, hour, dayName, handlers } = props
  const label = `${dayName} ${String(hour).padStart(2, '0')}:00`
  const base = 'w-full min-w-[38px] h-9 rounded-lg transition-colors text-[12px] font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-green'

  if (props.mode === 'edit') {
    const on = props.isOn(day, hour)
    return (
      <td className="p-0">
        <button type="button" {...handlers}
          aria-pressed={on} aria-label={`${label} — ${on ? 'disponibil' : 'indisponibil'}`}
          disabled={props.disabled}
          className={`${base} ${on ? 'bg-brand-green' : 'bg-white/5 hover:bg-white/10'} ${props.disabled ? 'opacity-50' : 'cursor-pointer'}`}
          style={{ touchAction: 'manipulation' }}
        />
      </td>
    )
  }

  const count = props.count(day, hour)
  const intensity = heatIntensity(count, props.respondents)
  const isSel = props.selected?.day === day && props.selected?.hour === hour
  const hasSession = props.marked?.(day, hour) ?? false
  return (
    <td className="p-0">
      <button type="button" {...handlers}
        aria-label={`${label} — ${count} disponibili${hasSession ? ', antrenament programat' : ''}`}
        aria-pressed={isSel}
        className={`${base} ${count === 0 ? 'bg-white/5 text-white/20' : intensity > 0.55 ? 'text-black' : 'text-white'} ${isSel ? 'ring-2 ring-white' : ''}`}
        style={count > 0 ? { backgroundColor: `rgba(var(--accent-rgb), ${(0.15 + 0.85 * intensity).toFixed(3)})` } : undefined}
      >
        <span className="relative">
          {count > 0 ? count : ''}
          {hasSession && (
            <span className="absolute -top-1.5 -right-2 w-2 h-2 rounded-full bg-white ring-1 ring-black/40" />
          )}
        </span>
      </button>
    </td>
  )
}
