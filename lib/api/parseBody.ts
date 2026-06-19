import { NextRequest, NextResponse } from 'next/server'

const TOO_LARGE = NextResponse.json({ ok: false, reason: 'payload-too-large' }, { status: 413 })

/**
 * Parse the JSON body of a request, rejecting payloads larger than `maxBytes`.
 * Returns `[data, null]` on success or `[null, response]` with a 413 response on failure.
 */
export async function parseBody<T = Record<string, unknown>>(
  req: NextRequest,
  maxBytes = 50_000,
): Promise<[T, null] | [null, NextResponse]> {
  const text = await req.text()
  if (text.length > maxBytes) return [null, TOO_LARGE]
  try {
    return [JSON.parse(text) as T, null]
  } catch {
    return [null, NextResponse.json({ ok: false, reason: 'invalid-json' }, { status: 400 })]
  }
}
