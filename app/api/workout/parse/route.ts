import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { parseBody } from '@/lib/api/parseBody'
import {
  parseWorkoutText, sanitizeParsedWorkout,
  type ParseCatalogueEntry, type ParsedWorkout,
} from '@/lib/voice/parse-workout'

export const dynamic = 'force-dynamic'

const PARSE_LIMIT = 30          // max parses per user per hour
const MAX_TEXT = 1000
const MAX_CATALOGUE = 400
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    exercises: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          sets: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                reps: { type: 'INTEGER' },
                durationSeconds: { type: 'INTEGER' },
                weightKg: { type: 'NUMBER' },
                bandKg: { type: 'NUMBER' },
              },
            },
          },
        },
        required: ['name', 'sets'],
      },
    },
    unrecognized: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['exercises', 'unrecognized'],
}

function buildPrompt(text: string, catalogue: ParseCatalogueEntry[]): string {
  const list = catalogue.map(e => `- ${e.name} (${e.metric === 'reps' ? 'reps' : 'seconds'})`).join('\n')
  return [
    'You convert a calisthenics athlete\'s spoken workout log (Romanian or English, possibly with speech-recognition errors) into JSON.',
    'Rules:',
    '- Map every exercise to EXACTLY one name from the catalogue below (copy the name verbatim). Push ups = Flotări, pull ups = Tracțiuni, squats = Squaturi.',
    '- Romanian speech recognition mangles English exercise names; match by sound. E.g. "masă lapuri" / "mascăl ap" = Muscle-Up.',
    '- Emit one entry in "sets" per set. "3 sets of 50" → three sets with reps 50. "10, 8, 6 pull ups" → three sets with reps 10, 8, 6.',
    '- For (reps) exercises fill "reps"; for (seconds) exercises fill "durationSeconds". Convert minutes to seconds.',
    '- If the number of reps/seconds was not said, still emit the sets but leave reps/durationSeconds out. Never invent numbers.',
    '- Added weight ("cu 10 kg", "+10kg") → weightKg; resistance band → bandKg.',
    '- Anything that is not a catalogue exercise (running, cycling, chatter) goes into "unrecognized" as the original phrase.',
    '',
    'Catalogue:',
    list,
    '',
    `Workout log: """${text}"""`,
  ].join('\n')
}

async function parseWithGemini(text: string, catalogue: ParseCatalogueEntry[], apiKey: string): Promise<ParsedWorkout> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(text, catalogue) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const data = await res.json()
  const out: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!out) throw new Error('gemini empty')
  return sanitizeParsedWorkout(JSON.parse(out), catalogue)
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth — any signed-in user ───────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return NextResponse.json({ ok: false }, { status: 401 })

    let callerUid: string
    try {
      callerUid = (await adminAuth().verifyIdToken(idToken)).uid
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    // ── Parse & validate ────────────────────────────────────────────────────
    const [body, err] = await parseBody<{ text?: unknown; catalogue?: unknown }>(req, 60_000)
    if (err) return err
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : ''
    if (!text) return NextResponse.json({ ok: false, reason: 'empty' }, { status: 400 })
    const catalogue: ParseCatalogueEntry[] = (Array.isArray(body.catalogue) ? body.catalogue : [])
      .slice(0, MAX_CATALOGUE)
      .filter((e): e is ParseCatalogueEntry =>
        !!e && typeof e.name === 'string' && e.name.length <= 80 && (e.metric === 'reps' || e.metric === 'seconds'))
    if (catalogue.length === 0) return NextResponse.json({ ok: false, reason: 'no-catalogue' }, { status: 400 })

    // ── Rules parser is free — only the AI path is rate limited ─────────────
    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      const now = Date.now()
      const rateRef = adminDb().collection('voice_parse_rate').doc(callerUid)
      const rateData = (await rateRef.get()).data() ?? {}
      const windowTs: number = rateData.windowStart ?? 0
      const inWindow = windowTs > now - 60 * 60 * 1000
      const count: number = inWindow ? (rateData.count ?? 0) : 0

      if (count < PARSE_LIMIT) {
        await rateRef.set(
          inWindow ? { count: FieldValue.increment(1) } : { windowStart: now, count: 1 },
          { merge: true },
        )
        try {
          const parsed = await parseWithGemini(text, catalogue, apiKey)
          return NextResponse.json({ ok: true, engine: 'ai', parsed })
        } catch (e) {
          console.error('[workout/parse] AI parse failed, using rules', e)
        }
      }
    }

    return NextResponse.json({ ok: true, engine: 'rules', parsed: parseWorkoutText(text, catalogue) })
  } catch (e) {
    console.error('[workout/parse]', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
