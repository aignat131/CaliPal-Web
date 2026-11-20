import { describe, it, expect } from 'vitest'
import {
  computeHeatmap, topSlots, resolveWeek, sanitizeWeek, sanitizeConfig, setSlot, setSlots,
  hasSlot, emptyWeek, weeksFollowingTypical, staleWeekKeys, heatIntensity, configHours,
  DEFAULT_SCHEDULE_CONFIG, type WeekMask, type AvailabilityDoc,
} from '../availability'

const cfg = DEFAULT_SCHEDULE_CONFIG // 10–24

/** Build a week mask from { day: [hours] } */
function wk(spec: Record<number, number[]>): WeekMask {
  let w = emptyWeek()
  for (const [d, hs] of Object.entries(spec)) for (const h of hs) w = setSlot(w, +d, h, true)
  return w
}

describe('bitmask helpers', () => {
  it('sets, clears and reads single slots', () => {
    let w = emptyWeek()
    w = setSlot(w, 2, 18, true)
    expect(hasSlot(w, 2, 18)).toBe(true)
    expect(hasSlot(w, 2, 19)).toBe(false)
    w = setSlot(w, 2, 18, false)
    expect(w).toEqual(emptyWeek())
  })

  it('does not mutate the input', () => {
    const w = emptyWeek()
    setSlot(w, 0, 10, true)
    expect(w).toEqual(emptyWeek())
  })

  it('paints many cells at once', () => {
    const w = setSlots(emptyWeek(), [{ day: 0, hour: 10 }, { day: 0, hour: 11 }, { day: 6, hour: 23 }], true)
    expect(hasSlot(w, 0, 10) && hasSlot(w, 0, 11) && hasSlot(w, 6, 23)).toBe(true)
  })

  it('sanitizes untrusted data', () => {
    expect(sanitizeWeek(null)).toEqual(emptyWeek())
    expect(sanitizeWeek([1, 'x', 2.5, -1])).toEqual([1, 0, 0, (1 << 24) - 1, 0, 0, 0])
    expect(sanitizeWeek([1 << 30, 0, 0, 0, 0, 0, 0])[0]).toBe(0) // bits above 23 dropped
  })

  it('validates config, falling back to defaults', () => {
    expect(sanitizeConfig({ startHour: 8, endHour: 22 })).toEqual({ startHour: 8, endHour: 22 })
    expect(sanitizeConfig({ startHour: 20, endHour: 10 })).toEqual(DEFAULT_SCHEDULE_CONFIG)
    expect(sanitizeConfig(undefined)).toEqual(DEFAULT_SCHEDULE_CONFIG)
    expect(configHours({ startHour: 22, endHour: 24 })).toEqual([22, 23])
  })
})

describe('typical schedule vs override', () => {
  const typical = wk({ 0: [18, 19], 2: [18, 19] })
  const custom = wk({ 4: [12] })

  it('returns "none" when nothing is set', () => {
    const r = resolveWeek(null, '2026-11-23')
    expect(r.source).toBe('none')
    expect(r.completed).toBe(false)
  })

  it('falls back to the typical schedule for weeks without an entry (not completed)', () => {
    const r = resolveWeek({ typical }, '2026-11-23')
    expect(r.source).toBe('typical')
    expect(r.mask).toEqual(typical)
    expect(r.completed).toBe(false)
  })

  it('uses the override for that week only', () => {
    const doc: AvailabilityDoc = { typical, weeks: { '2026-11-23': custom } }
    const thisWeek = resolveWeek(doc, '2026-11-23')
    expect(thisWeek.source).toBe('override')
    expect(thisWeek.mask).toEqual(custom)
    expect(thisWeek.customized).toBe(true)
    expect(thisWeek.completed).toBe(true)
    // Next week is untouched — the typical schedule still applies
    expect(resolveWeek(doc, '2026-11-30').mask).toEqual(typical)
  })

  it('an empty override is a valid "not available this week" answer', () => {
    const r = resolveWeek({ typical, weeks: { '2026-11-23': emptyWeek() } }, '2026-11-23')
    expect(r.mask).toEqual(emptyWeek())
    expect(r.completed).toBe(true)
  })

  it('a confirmed week equal to typical is completed but not customized', () => {
    const r = resolveWeek({ typical, weeks: { '2026-11-23': typical.slice() } }, '2026-11-23')
    expect(r.completed).toBe(true)
    expect(r.customized).toBe(false)
  })

  it('changing typical updates confirmed (uncustomized) current/future weeks only', () => {
    const doc: AvailabilityDoc = {
      typical,
      weeks: {
        '2026-11-16': typical.slice(), // past — keep
        '2026-11-23': typical.slice(), // confirmed — follow
        '2026-11-30': custom,          // customized — keep
      },
    }
    const next = wk({ 1: [20] })
    expect(weeksFollowingTypical(doc, next, '2026-11-23')).toEqual({ '2026-11-23': next })
  })

  it('prunes overrides older than the retention window', () => {
    const doc: AvailabilityDoc = { weeks: { '2026-01-05': custom, '2026-11-16': custom, '2026-12-07': custom } }
    expect(staleWeekKeys(doc, '2026-11-23')).toEqual(['2026-01-05'])
  })
})

describe('heatmap', () => {
  it('counts available members per slot and lists their uids', () => {
    const h = computeHeatmap([
      { uid: 'a', mask: wk({ 0: [18, 19] }) },
      { uid: 'b', mask: wk({ 0: [18] }) },
      { uid: 'c', mask: wk({ 3: [10] }) },
    ], cfg)
    expect(h.counts[0][18]).toBe(2)
    expect(h.counts[0][19]).toBe(1)
    expect(h.counts[3][10]).toBe(1)
    expect(h.uids[0][18]).toEqual(['a', 'b'])
    expect(h.respondents).toBe(3)
    expect(h.max).toBe(2)
  })

  it('ignores members with an empty week (they are not respondents)', () => {
    const h = computeHeatmap([
      { uid: 'a', mask: wk({ 0: [18] }) },
      { uid: 'b', mask: emptyWeek() },
    ], cfg)
    expect(h.respondents).toBe(1)
  })

  it('ignores slots outside the configured hour range', () => {
    const h = computeHeatmap([{ uid: 'a', mask: wk({ 0: [8, 18] }) }], cfg)
    expect(h.counts[0][8]).toBe(0)
    expect(h.counts[0][18]).toBe(1)
  })

  it('colour intensity is relative to respondents', () => {
    expect(heatIntensity(0, 10)).toBe(0)
    expect(heatIntensity(5, 10)).toBe(0.5)
    expect(heatIntensity(10, 10)).toBe(1)
    expect(heatIntensity(3, 0)).toBe(0)
  })
})

describe('top 5', () => {
  it('sorts by count desc, then day, then hour; skips empty slots', () => {
    const h = computeHeatmap([
      { uid: 'a', mask: wk({ 0: [18, 19], 2: [18], 5: [11] }) },
      { uid: 'b', mask: wk({ 0: [19], 2: [18], 5: [11] }) },
      { uid: 'c', mask: wk({ 2: [18], 6: [10] }) },
    ], cfg)
    expect(topSlots(h.counts, cfg, 5)).toEqual([
      { day: 2, hour: 18, count: 3 },
      { day: 0, hour: 19, count: 2 },
      { day: 5, hour: 11, count: 2 },
      { day: 0, hour: 18, count: 1 },
      { day: 6, hour: 10, count: 1 },
    ])
  })

  it('returns fewer than 5 when there are fewer non-empty slots', () => {
    const h = computeHeatmap([{ uid: 'a', mask: wk({ 1: [12] }) }], cfg)
    expect(topSlots(h.counts, cfg)).toEqual([{ day: 1, hour: 12, count: 1 }])
    expect(topSlots(computeHeatmap([], cfg).counts, cfg)).toEqual([])
  })
})
