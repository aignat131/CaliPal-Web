'use client'

import { auth } from '@/lib/firebase/auth'

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean
  status: number
  reason?: string
  data: T & { ok?: boolean; reason?: string }
}

/** Authenticated JSON call to our API routes. Never throws. */
export async function callApi<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' = body === undefined ? 'GET' : 'POST',
): Promise<ApiResult<T>> {
  try {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch(path, {
      method,
      cache: 'no-store',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.ok !== false, status: res.status, reason: data.reason, data }
  } catch {
    return { ok: false, status: 0, reason: 'network', data: {} as ApiResult<T>['data'] }
  }
}

/** Romanian messages for API error codes shown to the user. */
export const API_ERRORS: Record<string, string> = {
  full: 'Nu mai sunt locuri libere la acest antrenament.',
  closed: 'Antrenamentul a fost închis.',
  locked: 'Prezența nu mai poate fi modificată (au trecut 48h de la închidere).',
  'not-started': 'Antrenamentul nu a început încă.',
  'not-ended': 'Antrenamentul nu s-a terminat încă.',
  'checkin-closed': 'Check-in-ul e disponibil doar cu 15 min înainte și până la o oră după antrenament.',
  forbidden: 'Nu ai permisiunea pentru această acțiune.',
  'in-the-past': 'Nu poți programa un antrenament în trecut.',
  'bad-park': 'Parcul ales nu aparține comunității.',
  cooldown: 'Ai trimis deja recent. Încearcă mai târziu.',
  network: 'Problemă de conexiune. Încearcă din nou.',
}

export function apiErrorMessage(reason: string | undefined, fallback = 'A apărut o eroare. Încearcă din nou.'): string {
  return (reason && API_ERRORS[reason]) || fallback
}
