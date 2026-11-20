'use client'

import { useState } from 'react'

/**
 * Single-series progress line (one chart per metric — small multiples, never
 * a dual axis). 2px line, 8px markers, recessive grid, first/last values
 * labelled directly, tap/hover tooltip on every point.
 */
export function MetricChart({ title, unit, series }: {
  title: string
  unit: string
  series: { date: string; value: number }[]
}) {
  const [active, setActive] = useState<number | null>(null)
  const W = 320, H = 132
  const pad = { l: 30, r: 14, t: 18, b: 22 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const max = Math.max(1, ...series.map(s => s.value))
  const niceMax = niceCeil(max)
  const x = (i: number) => pad.l + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw)
  const y = (v: number) => pad.t + ih - (v / niceMax) * ih
  const grid = [0, niceMax / 2, niceMax]
  const path = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ')
  const fmtDate = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7)
  const last = series[series.length - 1]
  const sel = active !== null ? series[active] : null

  return (
    <figure className="rounded-xl bg-white/5 p-3">
      <figcaption className="flex items-baseline gap-2 mb-1">
        <span className="text-xs font-bold text-white/80 flex-1">{title}</span>
        {last && <span className="text-sm font-black text-white tabular-nums">{last.value} <span className="text-[11px] font-normal text-white/45">{unit}</span></span>}
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
          aria-label={`${title}: ${series.map(s => `${fmtDate(s.date)} ${s.value} ${unit}`).join(', ')}`}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null) }}>
          {grid.map(g => (
            <g key={g}>
              <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--chart-ink)">{fmtNum(g)}</text>
            </g>
          ))}
          {series.length > 1 && (
            <path d={path} fill="none" stroke="var(--chart-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + ih} stroke="var(--chart-ink)" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {series.map((s, i) => (
            <g key={s.date}>
              <circle cx={x(i)} cy={y(s.value)} r={4} fill="var(--chart-series)" stroke="var(--app-surface)" strokeWidth={2} />
              {/* Larger invisible hit target */}
              <rect x={x(i) - 14} y={pad.t} width={28} height={ih} fill="transparent"
                onPointerEnter={() => setActive(i)} onClick={() => setActive(active === i ? null : i)} />
            </g>
          ))}
          {/* Direct labels: first and last value only */}
          {series.length > 1 && (
            <text x={x(0)} y={y(series[0].value) - 8} textAnchor="middle" fontSize={10} fill="var(--chart-ink)">{fmtNum(series[0].value)}</text>
          )}
          {last && (
            <text x={x(series.length - 1)} y={y(last.value) - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor" className="text-white">{fmtNum(last.value)}</text>
          )}
          {/* X axis: first / last date */}
          {series.length > 0 && (
            <>
              <text x={x(0)} y={H - 6} textAnchor={series.length > 1 ? 'start' : 'middle'} fontSize={10} fill="var(--chart-ink)">{fmtDate(series[0].date)}</text>
              {series.length > 1 && <text x={x(series.length - 1)} y={H - 6} textAnchor="end" fontSize={10} fill="var(--chart-ink)">{fmtDate(last.date)}</text>}
            </>
          )}
        </svg>
        {sel && active !== null && (
          <div className="absolute pointer-events-none px-2 py-1 rounded-lg text-[11px] font-bold shadow-lg whitespace-nowrap"
            style={{
              left: `${(x(active) / W) * 100}%`, top: 0, transform: 'translate(-50%, -100%)',
              backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-divider)',
            }}>
            <span className="text-white">{sel.value} {unit}</span>
            <span className="text-white/45 font-normal"> · {fmtDate(sel.date)}.{sel.date.slice(0, 4)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}

function niceCeil(v: number): number {
  if (v <= 10) return Math.ceil(v / 2) * 2 || 2
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
