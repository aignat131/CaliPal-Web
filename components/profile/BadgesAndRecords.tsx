'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Lock, BadgeCheck } from 'lucide-react'
import { useLanguage } from '@/lib/context/LanguageContext'
import { useT } from '@/lib/context/LanguageContext'
import type { UserDoc } from '@/types'
import {
  type BadgeCategory, type BadgeResult,
  TIER_COLORS, badgeDesc, tierName,
} from '@/lib/gamification/badges'
import { LIFTS, formatRecordValue } from '@/lib/gamification/records'
import { loadBadgeData, publishRecords, syncBadges, type BadgeData } from '@/lib/gamification/badgeSync'

const CATEGORY_ORDER: BadgeCategory[] = ['firsts', 'strength', 'holds', 'consistency', 'social']

/** Loads badge + record data for a profile. Syncs earned levels when it's your own. */
export function useBadgeData(uid: string | undefined, user: Partial<UserDoc> | null | undefined, isOwn: boolean) {
  const [data, setData] = useState<BadgeData | null>(null)
  const [error, setError] = useState(false)
  // Re-run when the counters that feed badges change.
  const key = user
    ? [user.totalWorkouts, user.currentStreak, user.totalTrainings, user.friendCount, user.completedPrograms].join('|')
    : ''
  useEffect(() => {
    if (!uid || !user) return
    let cancelled = false
    loadBadgeData(uid, user)
      .then(async d => {
        if (cancelled) return
        setData(d)
        if (isOwn) {
          publishRecords(uid, user, d.workouts)
          const up = await syncBadges(uid, d).catch(() => [])
          if (!cancelled && up.length) setData({ ...d })
        }
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key, isOwn])
  return { data, loading: !data && !error, error }
}

export function RecordsGrid({ data, isOwn }: { data: BadgeData; isOwn: boolean }) {
  const { lang } = useLanguage()
  const t = useT()
  const lifts = LIFTS.filter(l => data.records[l.key].value > 0)

  if (lifts.length === 0) {
    return (
      <p className="text-xs text-white/35 text-center py-3">
        {isOwn ? t('records.empty_own') : t('records.empty_other')}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {lifts.map(l => {
        const r = data.records[l.key]
        return (
          <div key={l.key} className="rounded-xl px-3 py-2.5 border border-white/8"
            style={{ backgroundColor: 'var(--app-surface)' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{l.icon}</span>
              <p className="text-[11px] font-semibold text-white/50 truncate flex-1">{l.name[lang]}</p>
              {r.verified && (
                <span title={t('records.verified')}>
                  <BadgeCheck size={13} className="text-brand-green flex-shrink-0" />
                </span>
              )}
            </div>
            <p className="text-xl font-black text-white mt-0.5">
              {formatRecordValue(r.value, l.metric)}
              {l.metric === 'reps' && <span className="text-xs font-bold text-white/40 ml-1">rep</span>}
            </p>
            {r.date && (
              <p className="text-[10px] text-white/30">
                {r.date.toLocaleDateString(lang === 'RO' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BadgeIcon({ r, size = 56 }: { r: BadgeResult; size?: number }) {
  const tier = tierName(r.def, r.level)
  const color = tier ? TIER_COLORS[tier] : 'rgba(255,255,255,0.15)'
  return (
    <div className="relative rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: size, height: size,
        background: tier ? `radial-gradient(circle at 30% 30%, ${color}55, ${color}18)` : 'rgba(255,255,255,0.04)',
        border: `2.5px solid ${color}`,
        filter: tier ? 'none' : 'grayscale(1)',
        opacity: tier ? 1 : 0.45,
      }}>
      <span style={{ fontSize: size * 0.45 }}>{r.def.icon}</span>
      {!tier && (
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--app-bg)' }}>
          <Lock size={10} className="text-white/50" />
        </span>
      )}
      {tier && r.def.thresholds.length > 1 && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          {r.def.thresholds.map((_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: i < r.level ? color : 'rgba(255,255,255,0.2)' }} />
          ))}
        </span>
      )}
    </div>
  )
}

function unitLabel(unit: string | undefined, lang: 'RO' | 'EN'): string {
  if (unit === 'seconds') return 's'
  if (unit === 'reps') return ' rep'
  if (unit === 'days') return lang === 'RO' ? ' zile' : ' days'
  return ''
}

function BadgeSheet({ r, onClose, isOwn }: { r: BadgeResult; onClose: () => void; isOwn: boolean }) {
  const { lang } = useLanguage()
  const t = useT()
  const tiered = r.def.thresholds.length > 1
  const tierLabels = [t('badges.bronze'), t('badges.silver'), t('badges.gold')]
  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-8" style={{ backgroundColor: 'var(--app-surface)' }}
        onClick={e => e.stopPropagation()} role="dialog" aria-label={r.def.name[lang]}>
        <div className="flex justify-end">
          <button onClick={onClose} aria-label={t('common.close')} className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center">
            <X size={13} className="text-white/50" />
          </button>
        </div>
        <div className="flex flex-col items-center text-center gap-2 -mt-2">
          <BadgeIcon r={r} size={84} />
          <p className="text-lg font-black text-white mt-2">{r.def.name[lang]}</p>
          <p className="text-sm text-white/55">{badgeDesc(r.def, r.level || 1, lang)}</p>
        </div>
        {tiered && (
          <div className="flex flex-col gap-1.5 mt-5">
            {r.def.thresholds.map((th, i) => {
              const done = i < r.level
              const color = TIER_COLORS[(['bronze', 'silver', 'gold'] as const)[i]]
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2 border"
                  style={{ borderColor: done ? `${color}66` : 'rgba(255,255,255,0.08)' }}>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: done ? color : 'rgba(255,255,255,0.15)' }} />
                  <span className="text-sm font-bold text-white flex-1">{tierLabels[i]}</span>
                  <span className="text-xs text-white/50">{th}{unitLabel(r.def.unit, lang)}</span>
                </div>
              )
            })}
          </div>
        )}
        {isOwn && r.next !== null && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-white/45 mb-1.5">
              <span>{t('badges.progress')}</span>
              <span>{Math.min(r.value, r.next)}{unitLabel(r.def.unit, lang)} / {r.next}{unitLabel(r.def.unit, lang)}</span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-brand-green" style={{ width: `${Math.min(100, (r.value / r.next) * 100)}%` }} />
            </div>
          </div>
        )}
        {r.def.unit && r.def.unit !== 'days' && (
          <p className="text-[11px] text-white/30 text-center mt-4">{t('badges.how_to')}</p>
        )}
      </div>
    </div>
  )
}

export function BadgeWall({ data, isOwn }: { data: BadgeData; isOwn: boolean }) {
  const { lang } = useLanguage()
  const t = useT()
  const [open, setOpen] = useState<BadgeResult | null>(null)
  const earned = data.results.filter(r => r.level > 0)
  const shown = isOwn ? data.results : earned

  const grouped = useMemo(() => CATEGORY_ORDER
    .map(cat => ({ cat, items: shown.filter(r => r.def.category === cat) }))
    .filter(g => g.items.length > 0), [shown])

  if (!isOwn && earned.length === 0) {
    return <p className="text-xs text-white/35 text-center py-3">{t('badges.none_other')}</p>
  }

  return (
    <div>
      <p className="text-xs text-white/40 mb-3">
        {t('badges.earned_count', { n: String(earned.length), total: String(data.results.length) })}
      </p>
      <div className="flex flex-col gap-4">
        {grouped.map(g => (
          <div key={g.cat}>
            <p className="text-[11px] font-bold text-white/40 tracking-[1.5px] uppercase mb-2">{t(`badges.cat_${g.cat}`)}</p>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {g.items
                .slice()
                .sort((a, b) => Number(b.level > 0) - Number(a.level > 0))
                .map(r => (
                  <button key={r.def.id} onClick={() => setOpen(r)}
                    className="flex flex-col items-center gap-1.5 text-center">
                    <BadgeIcon r={r} />
                    <span className={`text-[10.5px] leading-tight font-semibold ${r.level > 0 ? 'text-white/80' : 'text-white/35'}`}>
                      {r.def.name[lang]}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      {open && <BadgeSheet r={open} isOwn={isOwn} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Compact row of the best earned badges, for profile headers. */
export function BadgeStrip({ data, max = 6 }: { data: BadgeData; max?: number }) {
  const { lang } = useLanguage()
  const earned = data.results
    .filter(r => r.level > 0)
    .sort((a, b) => b.level - a.level || b.def.thresholds.length - a.def.thresholds.length)
    .slice(0, max)
  if (earned.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {earned.map(r => (
        <span key={r.def.id} title={r.def.name[lang]}><BadgeIcon r={r} size={30} /></span>
      ))}
    </div>
  )
}
