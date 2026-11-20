import { describe, it, expect } from 'vitest'
import {
  todayKey, weekStartOf, currentWeekStart, addWeeks, weekDays, weeksBetween, isDateKey, slotLabel, relativeTimeRo,
} from '../week'

describe('week helpers (Europe/Bucharest)', () => {
  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23') // Monday
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23') // Sunday
    expect(weekStartOf('2026-11-30')).toBe('2026-11-30')
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28') // across year end
  })

  it('evaluates "today" in Bucharest, not UTC', () => {
    // 2026-11-22 23:30 UTC = 2026-11-23 01:30 in Bucharest (UTC+2) → already Monday
    const late = new Date(Date.UTC(2026, 10, 22, 23, 30))
    expect(todayKey(late)).toBe('2026-11-23')
    expect(currentWeekStart(late)).toBe('2026-11-23')
    // Summer time (UTC+3): 2026-06-28 21:30 UTC = 2026-06-29 00:30 local (Monday)
    expect(currentWeekStart(new Date(Date.UTC(2026, 5, 28, 21, 30)))).toBe('2026-06-29')
  })

  it('navigates weeks across DST changes', () => {
    expect(addWeeks('2026-03-23', 1)).toBe('2026-03-30') // EU DST starts 29 March
    expect(addWeeks('2026-10-19', 1)).toBe('2026-10-26') // ends 25 October
    expect(weeksBetween('2026-11-23', '2026-12-14')).toBe(3)
    expect(weeksBetween('2026-11-23', '2026-11-09')).toBe(-2)
  })

  it('labels days like "Luni 23.11"', () => {
    const d = weekDays('2026-11-23')
    expect(d).toHaveLength(7)
    expect(`${d[0].name} ${d[0].dayMonth}`).toBe('Luni 23.11')
    expect(`${d[6].name} ${d[6].dayMonth}`).toBe('Duminică 29.11')
  })

  it('validates date keys', () => {
    expect(isDateKey('2026-11-23')).toBe(true)
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('23.11.2026')).toBe(false)
    expect(isDateKey(null)).toBe(false)
  })

  it('formats slots and relative times', () => {
    expect(slotLabel(18)).toBe('18:00–19:00')
    expect(slotLabel(23)).toBe('23:00–24:00')
    const now = Date.UTC(2026, 10, 20, 12)
    expect(relativeTimeRo(null, now)).toBe('niciodată')
    expect(relativeTimeRo(now - 30_000, now)).toBe('chiar acum')
    expect(relativeTimeRo(now - 3 * 3600_000, now)).toBe('acum 3 ore')
    expect(relativeTimeRo(now - 86_400_000, now)).toBe('ieri')
    expect(relativeTimeRo(now - 4 * 86_400_000, now)).toBe('acum 4 zile')
  })
})
