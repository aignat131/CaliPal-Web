/**
 * Calendar export for trainings: .ics file and "Add to Google Calendar" link.
 * Times are kept as Bucharest wall-clock times (TZID / ctz) — no conversion.
 */
import { SCHEDULE_TIME_ZONE } from './week'

interface CalendarTraining {
  id: string
  name: string
  description?: string
  location?: string
  timeStart: string   // "dd/MM/yyyy HH:mm"
  timeEnd?: string
}

function compact(s: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(s ?? '')
  return m ? `${m[3]}${m[2]}${m[1]}T${m[4]}${m[5]}00` : null
}

function endOrDefault(t: CalendarTraining): string | null {
  const end = compact(t.timeEnd)
  if (end) return end
  const start = compact(t.timeStart)
  if (!start) return null
  // default: +90 min
  const h = +start.slice(9, 11), m = +start.slice(11, 13)
  const total = Math.min(h * 60 + m + 90, 23 * 60 + 59)
  return `${start.slice(0, 9)}${String(Math.floor(total / 60)).padStart(2, '0')}${String(total % 60).padStart(2, '0')}00`
}

/** RFC 5545 text escaping. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines longer than 75 octets (simplified: by characters). */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74) }
  out.push(rest)
  return out.join('\r\n')
}

export function buildIcs(t: CalendarTraining, url: string, now: Date = new Date()): string | null {
  const start = compact(t.timeStart)
  const end = endOrDefault(t)
  if (!start || !end) return null
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CaliPal//Antrenamente//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${t.id}@calipal.ro`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${SCHEDULE_TIME_ZONE}:${start}`,
    `DTEND;TZID=${SCHEDULE_TIME_ZONE}:${end}`,
    `SUMMARY:${esc(t.name)}`,
    ...(t.location ? [`LOCATION:${esc(t.location)}`] : []),
    `DESCRIPTION:${esc([t.description, url].filter(Boolean).join('\n\n'))}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function googleCalendarUrl(t: CalendarTraining, url: string): string | null {
  const start = compact(t.timeStart)
  const end = endOrDefault(t)
  if (!start || !end) return null
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: t.name,
    dates: `${start}/${end}`,
    ctz: SCHEDULE_TIME_ZONE,
    details: [t.description, url].filter(Boolean).join('\n\n'),
    ...(t.location ? { location: t.location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

/** Trigger a .ics download in the browser. */
export function downloadIcs(t: CalendarTraining, url: string): boolean {
  const ics = buildIcs(t, url)
  if (!ics) return false
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${t.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'antrenament'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return true
}
