import type { TrainingExercise } from '@/types'
import { isDateKey } from './week'

/** Session focus presets; any other non-empty string is a custom focus. */
export const FOCUS_OPTIONS = ['Push', 'Pull', 'Legs', 'Skill', 'Full body'] as const

export const FOCUS_EMOJI: Record<string, string> = {
  Push: '🫸', Pull: '🧗', Legs: '🦵', Skill: '🤸', 'Full body': '💪',
}

export function focusLabel(focus: string | undefined): string {
  if (!focus) return ''
  return `${FOCUS_EMOJI[focus] ?? '🎯'} ${focus}`
}

export interface SessionTemplate {
  id: string
  name: string
  focus: string
  durationMinutes: number
  exercises: TrainingExercise[]
  notes: string
}

export interface SessionInput {
  name: string
  focus: string
  date: string            // yyyy-MM-dd
  startTime: string       // HH:mm
  durationMinutes: number
  location: string
  parkId: string | null
  capacity: number | null
  notes: string
  templateId: string | null
  exercises: TrainingExercise[]
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function sanitizeExercises(v: unknown): TrainingExercise[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 30).flatMap(e => {
    const o = (e ?? {}) as Record<string, unknown>
    const name = str(o.name, 80)
    if (!name) return []
    const sets = Number.isInteger(o.sets) ? Math.min(Math.max(o.sets as number, 1), 50) : 3
    const repsPerSet = Number.isInteger(o.repsPerSet) ? Math.min(Math.max(o.repsPerSet as number, 1), 1000) : 10
    return [{ name, sets, repsPerSet }]
  })
}

/** Validate an untrusted create-session request. Returns the clean input or an error code. */
export function parseSessionInput(body: unknown): { ok: true; value: SessionInput } | { ok: false; reason: string } {
  const o = (body ?? {}) as Record<string, unknown>
  const focus = str(o.focus, 40)
  if (!focus) return { ok: false, reason: 'missing-focus' }
  if (!isDateKey(o.date)) return { ok: false, reason: 'bad-date' }
  const startTime = str(o.startTime, 5)
  if (!HHMM.test(startTime)) return { ok: false, reason: 'bad-time' }
  const durationMinutes = Number(o.durationMinutes)
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) {
    return { ok: false, reason: 'bad-duration' }
  }
  let capacity: number | null = null
  if (o.capacity !== null && o.capacity !== undefined && o.capacity !== '') {
    const c = Number(o.capacity)
    if (!Number.isInteger(c) || c < 1 || c > 500) return { ok: false, reason: 'bad-capacity' }
    capacity = c
  }
  const name = str(o.name, 120) || `Antrenament ${focus}`
  return {
    ok: true,
    value: {
      name,
      focus,
      date: o.date as string,
      startTime,
      durationMinutes,
      location: str(o.location, 100),
      parkId: str(o.parkId, 128) || null,
      capacity,
      notes: str(o.notes, 1000),
      templateId: str(o.templateId, 128) || null,
      exercises: sanitizeExercises(o.exercises),
    },
  }
}

/** End time "HH:mm" (same day, clamped to 23:59) for a start + duration. */
export function endTimeOf(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = Math.min(h * 60 + m + durationMinutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function goingCount(rsvps: Record<string, string> | undefined): number {
  return Object.values(rsvps ?? {}).filter(s => s === 'GOING').length
}

/** Compare who said they're coming vs who said they were available. */
export function compareRsvpToAvailability(goingUids: string[], availableUids: string[]) {
  const going = new Set(goingUids)
  const avail = new Set(availableUids)
  return {
    goingAndAvailable: goingUids.filter(u => avail.has(u)),
    goingNotAvailable: goingUids.filter(u => !avail.has(u)),
    availableNotGoing: availableUids.filter(u => !going.has(u)),
  }
}
