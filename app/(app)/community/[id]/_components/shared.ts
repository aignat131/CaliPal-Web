import type { MemberRole } from '@/types'

export const ROLE_COLORS: Record<MemberRole, string> = {
  ADMIN: '#FFB800',
  MODERATOR: '#3B82F6',
  TRAINER: '#F97316',
  MEMBER: 'var(--accent)',
}

export const ROLE_TEXT_COLORS: Record<MemberRole, string> = {
  ADMIN: '#DCA64E',
  MODERATOR: '#6FA8E8',
  TRAINER: '#F97316',
  MEMBER: '#7E8A84',
}

/** Format "dd/MM/yyyy HH:mm" full-datetime string from a date + time inputs. */
export function toAndroidDateTime(date: string, time: string): string {
  // date is "yyyy-MM-dd", time is "HH:mm"
  if (!date || !time) return ''
  const [yyyy, mm, dd] = date.split('-')
  return `${dd}/${mm}/${yyyy} ${time}`
}
