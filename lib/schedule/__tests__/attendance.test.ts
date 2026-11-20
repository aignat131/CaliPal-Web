import { describe, it, expect } from 'vitest'
import {
  diffAwards, targetAwards, legacyAwards, sanitizePoints, canEditAttendance, canCheckIn,
  DEFAULT_POINTS, ATTENDANCE_EDIT_WINDOW_MS,
} from '../attendance'

const P = DEFAULT_POINTS // 10 / 25

/** Apply a list of deltas to a running points table, like the API does with increments. */
function apply(table: Record<string, number>, deltas: ReturnType<typeof diffAwards>) {
  const out = { ...table }
  for (const d of deltas) out[d.uid] = (out[d.uid] ?? 0) + d.points
  return out
}

describe('attendance points', () => {
  it('awards configured points to attendees and the session author', () => {
    expect(targetAwards(['a', 'b'], 'coach', P)).toEqual({ a: 10, b: 10, coach: 10 })
    expect(targetAwards(['a'], 'coach', { attendance: 15, goalAchieved: 0 })).toEqual({ a: 15, coach: 15 })
  })

  it('the author gets nothing when nobody attended', () => {
    expect(targetAwards([], 'coach', P)).toEqual({})
  })

  it('first close credits everyone once', () => {
    const d = diffAwards({}, targetAwards(['a', 'b'], 'coach', P))
    expect(d).toEqual([
      { uid: 'a', points: 10, attendedDelta: 1 },
      { uid: 'b', points: 10, attendedDelta: 1 },
      { uid: 'coach', points: 10, attendedDelta: 1 },
    ])
  })

  it('re-submitting the same list is a no-op (idempotent)', () => {
    const awards = targetAwards(['a', 'b'], 'coach', P)
    expect(diffAwards(awards, targetAwards(['a', 'b'], 'coach', P))).toEqual([])
  })

  it('correcting attendance only applies the difference', () => {
    const before = targetAwards(['a', 'b'], 'coach', P)
    const after = targetAwards(['a', 'c'], 'coach', P) // b didn't come, c did
    expect(diffAwards(before, after)).toEqual([
      { uid: 'b', points: -10, attendedDelta: -1 },
      { uid: 'c', points: 10, attendedDelta: 1 },
    ])
  })

  it('a sequence of edits ends with exactly the right totals', () => {
    let table: Record<string, number> = {}
    let awards: Record<string, number> = {}
    for (const list of [['a'], ['a', 'b'], ['b'], ['a', 'b'], ['a', 'b']]) {
      const next = targetAwards(list, 'coach', P)
      table = apply(table, diffAwards(awards, next))
      awards = next
    }
    expect(table).toEqual({ a: 10, b: 10, coach: 10 })
  })

  it('removing everyone revokes the author too', () => {
    const d = diffAwards(targetAwards(['a'], 'coach', P), targetAwards([], 'coach', P))
    expect(d).toEqual([
      { uid: 'a', points: -10, attendedDelta: -1 },
      { uid: 'coach', points: -10, attendedDelta: -1 },
    ])
  })

  it('a points change applies to the edited session as a difference', () => {
    const d = diffAwards({ a: 10 }, { a: 20 })
    expect(d).toEqual([{ uid: 'a', points: 10, attendedDelta: 0 }])
  })

  it('reconstructs legacy awards (10 pts to attendees + author)', () => {
    expect(legacyAwards(['a', 'b'], 'coach')).toEqual({ a: 10, b: 10, coach: 10 })
    expect(legacyAwards([], 'coach')).toEqual({})
    // legacy → new list: only the delta
    expect(diffAwards(legacyAwards(['a', 'b'], 'coach'), targetAwards(['a', 'b', 'c'], 'coach', P)))
      .toEqual([{ uid: 'c', points: 10, attendedDelta: 1 }])
  })

  it('sanitizes configured points', () => {
    expect(sanitizePoints(undefined)).toEqual(DEFAULT_POINTS)
    expect(sanitizePoints({ attendance: 5, goalAchieved: 50 })).toEqual({ attendance: 5, goalAchieved: 50 })
    expect(sanitizePoints({ attendance: -1, goalAchieved: 99999 })).toEqual(DEFAULT_POINTS)
    expect(sanitizePoints({ attendance: 2.5 })).toEqual(DEFAULT_POINTS)
  })
})

describe('attendance windows', () => {
  const start = Date.UTC(2026, 10, 24, 16) // 18:00 Bucharest
  const end = start + 90 * 60_000

  it('staff can set attendance after start, until 48h after closing', () => {
    expect(canEditAttendance({ now: start - 1, startMs: start, closedAtMs: null, isSuperAdmin: false }))
      .toEqual({ ok: false, reason: 'not-started' })
    expect(canEditAttendance({ now: start + 1, startMs: start, closedAtMs: null, isSuperAdmin: false }).ok).toBe(true)
    const closed = end + 1000
    expect(canEditAttendance({ now: closed + ATTENDANCE_EDIT_WINDOW_MS - 1, startMs: start, closedAtMs: closed, isSuperAdmin: false }).ok).toBe(true)
    expect(canEditAttendance({ now: closed + ATTENDANCE_EDIT_WINDOW_MS + 1, startMs: start, closedAtMs: closed, isSuperAdmin: false }))
      .toEqual({ ok: false, reason: 'locked' })
    expect(canEditAttendance({ now: closed + 10 * ATTENDANCE_EDIT_WINDOW_MS, startMs: start, closedAtMs: closed, isSuperAdmin: true }).ok).toBe(true)
  })

  it('check-in is open from 15 min before start to 1h after end', () => {
    expect(canCheckIn({ now: start - 16 * 60_000, startMs: start, endMs: end }).ok).toBe(false)
    expect(canCheckIn({ now: start - 14 * 60_000, startMs: start, endMs: end }).ok).toBe(true)
    expect(canCheckIn({ now: end + 59 * 60_000, startMs: start, endMs: end }).ok).toBe(true)
    expect(canCheckIn({ now: end + 61 * 60_000, startMs: start, endMs: end }).ok).toBe(false)
    expect(canCheckIn({ now: start, startMs: null, endMs: null }).ok).toBe(false)
  })
})
