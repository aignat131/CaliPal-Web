'use client'

import { useState } from 'react'
import type { PlannedTraining } from '@/types'
import { useToast } from '@/lib/context/ToastContext'
import { focusLabel, goingCount } from '@/lib/schedule/sessions'
import { canCheckIn } from '@/lib/schedule/attendance'
import { parseTrainingMs } from '@/lib/schedule/week'
import { downloadIcs, googleCalendarUrl } from '@/lib/schedule/calendar'
import { callApi, apiErrorMessage } from '@/lib/schedule/client'
import { CalendarPlus, MapPinCheck, Users } from 'lucide-react'

/**
 * Extra info/actions shown on a training card: focus, seat limit, calendar
 * export and self check-in. Used by the community "Antrenamente" tab and the
 * training detail page.
 */
export function TrainingPlanExtras({ training, communityId, myUid, isMember, readOnly }: {
  training: PlannedTraining
  communityId: string
  myUid: string
  isMember: boolean
  readOnly?: boolean
}) {
  const { showToast } = useToast()
  const [showCal, setShowCal] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)

  const going = goingCount(training.rsvps)
  const capacity = typeof training.capacity === 'number' ? training.capacity : null
  const full = capacity !== null && going >= capacity
  const startMs = parseTrainingMs(training.timeStart)
  const endMs = parseTrainingMs(training.timeEnd)
  const checkedIn = (training.attendedBy ?? []).includes(myUid)
  const checkInOpen = isMember && !!myUid && canCheckIn({ now: Date.now(), startMs, endMs }).ok

  const url = typeof window !== 'undefined' ? `${window.location.origin}/training/${communityId}/${training.id}` : ''
  const calTraining = {
    id: training.id, name: training.name, description: training.description,
    location: training.location, timeStart: training.timeStart, timeEnd: training.timeEnd,
  }
  const gcal = googleCalendarUrl(calTraining, url)

  async function checkIn() {
    setCheckingIn(true)
    const res = await callApi(`/api/community/${communityId}/trainings/${training.id}/attendance`, { mode: 'checkin' })
    setCheckingIn(false)
    if (res.ok) showToast('Check-in făcut! 💪', 'success')
    else showToast(apiErrorMessage(res.reason), 'error')
  }

  const hasChips = !!training.focus || capacity !== null
  if (!hasChips && readOnly) return null

  return (
    <div className="flex flex-col gap-2 mb-3">
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {training.focus && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-white/80">{focusLabel(training.focus)}</span>
          )}
          {capacity !== null && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${full ? 'bg-red-500/15 text-red-400' : 'bg-white/8 text-white/70'}`}>
              <Users size={11} /> {going}/{capacity} locuri{full ? ' · Plin' : ''}
            </span>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {gcal && (
            <div className="relative">
              <button onClick={() => setShowCal(v => !v)} aria-expanded={showCal}
                className="h-8 px-2.5 rounded-lg border border-white/15 text-white/60 text-xs font-bold flex items-center gap-1">
                <CalendarPlus size={12} /> Calendar
              </button>
              {showCal && (
                <div className="absolute left-0 top-9 z-30 rounded-xl overflow-hidden shadow-xl min-w-44" style={{ backgroundColor: 'var(--app-surface)' }}>
                  <a href={gcal} target="_blank" rel="noopener noreferrer" onClick={() => setShowCal(false)}
                    className="block px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/8">Google Calendar</a>
                  <button onClick={() => { downloadIcs(calTraining, url); setShowCal(false) }}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/8">Descarcă .ics (Apple/Outlook)</button>
                </div>
              )}
            </div>
          )}
          {checkInOpen && (
            checkedIn
              ? <span className="h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 text-brand-green bg-brand-green/10">
                  <MapPinCheck size={12} /> Prezent
                </span>
              : <button onClick={() => void checkIn()} disabled={checkingIn}
                  className="h-8 px-2.5 rounded-lg bg-brand-green text-black text-xs font-black flex items-center gap-1 disabled:opacity-50">
                  <MapPinCheck size={12} /> {checkingIn ? '…' : 'Check-in'}
                </button>
          )}
        </div>
      )}
    </div>
  )
}
