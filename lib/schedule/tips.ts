/**
 * Coach tips — short pieces of advice a Fondator/Antrenor gives one member
 * (warm up more, technique cues, mobility, recovery…). Pure logic, shared by
 * API, UI and tests.
 *
 * Storage: communities/{cid}/memberPlans/{uid}/tips/{tipId}
 *   { text, category, authorUid, authorName, createdAt, seen }
 * Created only through POST /api/community/{id}/members/{uid}/tips (so the
 * member gets a notification); the member may only flip `seen`.
 */

export const TIP_CATEGORIES = ['warmup', 'technique', 'mobility', 'recovery', 'nutrition', 'general'] as const
export type TipCategory = typeof TIP_CATEGORIES[number]

export const TIP_LABELS: Record<TipCategory, string> = {
  warmup: 'Încălzire',
  technique: 'Tehnică',
  mobility: 'Mobilitate',
  recovery: 'Recuperare',
  nutrition: 'Alimentație',
  general: 'General',
}

export const TIP_EMOJI: Record<TipCategory, string> = {
  warmup: '🔥',
  technique: '🎯',
  mobility: '🧘',
  recovery: '😴',
  nutrition: '🥗',
  general: '💡',
}

export const TIP_MAX_LENGTH = 1000

export interface CoachTip {
  id: string
  text: string
  category: TipCategory
  authorName: string
  createdAtMs: number | null
  seen: boolean
}

export function isTipCategory(v: unknown): v is TipCategory {
  return typeof v === 'string' && (TIP_CATEGORIES as readonly string[]).includes(v)
}

/** Validates a new tip from the request body. Returns null when invalid. */
export function parseTipInput(body: { text?: unknown; category?: unknown }): { text: string; category: TipCategory } | null {
  if (typeof body.text !== 'string') return null
  const text = body.text.trim().replace(/\n{3,}/g, '\n\n')
  if (!text || text.length > TIP_MAX_LENGTH) return null
  return { text, category: isTipCategory(body.category) ? body.category : 'general' }
}
