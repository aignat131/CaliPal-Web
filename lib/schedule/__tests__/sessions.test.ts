import { describe, it, expect } from 'vitest'
import { parseSessionInput, endTimeOf, compareRsvpToAvailability, goingCount, sanitizeExercises } from '../sessions'
import { buildIcs, googleCalendarUrl } from '../calendar'
import { bucharestToMs, parseTrainingMs, trainingSlot, toTrainingDateTime } from '../week'

const valid = { focus: 'Pull', date: '2026-11-24', startTime: '18:00', durationMinutes: 90 }

describe('session input', () => {
  it('accepts a minimal valid session and names it after the focus', () => {
    const r = parseSessionInput(valid)
    expect(r.ok && r.value.name).toBe('Antrenament Pull')
    expect(r.ok && r.value.capacity).toBe(null)
  })

  it('rejects bad values', () => {
    expect(parseSessionInput({ ...valid, focus: '' })).toEqual({ ok: false, reason: 'missing-focus' })
    expect(parseSessionInput({ ...valid, date: '2026-02-30' })).toEqual({ ok: false, reason: 'bad-date' })
    expect(parseSessionInput({ ...valid, startTime: '25:00' })).toEqual({ ok: false, reason: 'bad-time' })
    expect(parseSessionInput({ ...valid, durationMinutes: 5 })).toEqual({ ok: false, reason: 'bad-duration' })
    expect(parseSessionInput({ ...valid, capacity: 0 })).toEqual({ ok: false, reason: 'bad-capacity' })
  })

  it('keeps a seat limit and cleans exercises', () => {
    const r = parseSessionInput({ ...valid, capacity: 12, exercises: [{ name: ' Tracțiuni ', sets: 4, repsPerSet: 8 }, { name: '' }] })
    expect(r.ok && r.value.capacity).toBe(12)
    expect(r.ok && r.value.exercises).toEqual([{ name: 'Tracțiuni', sets: 4, repsPerSet: 8 }])
    expect(sanitizeExercises('nope')).toEqual([])
  })

  it('computes the end time (clamped to the same day)', () => {
    expect(endTimeOf('18:00', 90)).toBe('19:30')
    expect(endTimeOf('23:00', 120)).toBe('23:59')
  })
})

describe('RSVP vs availability', () => {
  it('splits members into the three comparison groups', () => {
    expect(compareRsvpToAvailability(['a', 'b'], ['b', 'c'])).toEqual({
      goingAndAvailable: ['b'],
      goingNotAvailable: ['a'],
      availableNotGoing: ['c'],
    })
  })
  it('counts only GOING', () => {
    expect(goingCount({ a: 'GOING', b: 'MAYBE', c: 'NOT_GOING', d: 'GOING' })).toBe(2)
    expect(goingCount(undefined)).toBe(0)
  })
})

describe('Bucharest times (server-safe)', () => {
  it('converts wall-clock time to the right instant in winter and summer', () => {
    expect(new Date(bucharestToMs('2026-11-24', 18)).toISOString()).toBe('2026-11-24T16:00:00.000Z') // UTC+2
    expect(new Date(bucharestToMs('2026-07-14', 18, 30)).toISOString()).toBe('2026-07-14T15:30:00.000Z') // UTC+3
  })
  it('parses the stored training format', () => {
    expect(parseTrainingMs('24/11/2026 18:00')).toBe(bucharestToMs('2026-11-24', 18))
    expect(parseTrainingMs('garbage')).toBe(null)
    expect(toTrainingDateTime('2026-11-24', '18:00')).toBe('24/11/2026 18:00')
  })
  it('maps a training to its week, day and hour', () => {
    expect(trainingSlot('26/11/2026 19:30')).toEqual({ weekKey: '2026-11-23', day: 3, hour: 19, dateKey: '2026-11-26' })
  })
})

describe('calendar export', () => {
  const t = { id: 't1', name: 'Pull, standard', description: 'Aduceți benzi', location: 'Parc Copou', timeStart: '24/11/2026 18:00', timeEnd: '24/11/2026 19:30' }

  it('builds a valid .ics in Bucharest time', () => {
    const ics = buildIcs(t, 'https://calipal.ro/training/c/t1', new Date(Date.UTC(2026, 10, 20)))!
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART;TZID=Europe/Bucharest:20261124T180000')
    expect(ics).toContain('DTEND;TZID=Europe/Bucharest:20261124T193000')
    expect(ics).toContain('SUMMARY:Pull\\, standard')
    expect(ics).toContain('UID:t1@calipal.ro')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('defaults to 90 minutes when there is no end time', () => {
    expect(buildIcs({ ...t, timeEnd: undefined }, 'u')).toContain('DTEND;TZID=Europe/Bucharest:20261124T193000')
  })

  it('builds a Google Calendar link', () => {
    const url = new URL(googleCalendarUrl(t, 'https://x')!)
    expect(url.searchParams.get('dates')).toBe('20261124T180000/20261124T193000')
    expect(url.searchParams.get('ctz')).toBe('Europe/Bucharest')
    expect(url.searchParams.get('text')).toBe('Pull, standard')
  })
})
