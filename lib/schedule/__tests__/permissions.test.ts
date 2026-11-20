import { describe, it, expect } from 'vitest'
import { can, canEditOwnData, type ScheduleAction } from '../permissions'

const ALL: ScheduleAction[] = [
  'viewOverviewNames', 'sendReminders', 'configureSchedule', 'createSessions',
  'manageTemplates', 'markAttendance', 'assignExercises', 'viewMemberFile',
]

describe('schedule permissions', () => {
  it('Fondator and Antrenor can do everything', () => {
    for (const a of ALL) {
      expect(can('ADMIN', a)).toBe(true)
      expect(can('TRAINER', a)).toBe(true)
    }
  })

  it('Voluntar sees the overview, marks attendance and reminds — nothing else', () => {
    const allowed = new Set<ScheduleAction>(['viewOverviewNames', 'sendReminders', 'markAttendance'])
    for (const a of ALL) expect(can('MODERATOR', a)).toBe(allowed.has(a))
  })

  it('Membru has no staff capabilities (heatmap counts only)', () => {
    for (const a of ALL) expect(can('MEMBER', a)).toBe(false)
  })

  it('non-members get nothing; superadmin gets everything', () => {
    for (const a of ALL) {
      expect(can(null, a)).toBe(false)
      expect(can(null, a, true)).toBe(true)
    }
  })

  it('own data is editable only by its owner, and only while a member', () => {
    expect(canEditOwnData('u1', 'u1', true)).toBe(true)
    expect(canEditOwnData('u1', 'u2', true)).toBe(false)
    expect(canEditOwnData('u1', 'u1', false)).toBe(false)
  })
})
