import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { Resend } from 'resend'

// ── Secrets (set via: firebase functions:secrets:set <NAME>) ──────────────────
const SUPERADMIN_EMAIL = defineSecret('SUPERADMIN_EMAIL')
const RESEND_API_KEY   = defineSecret('RESEND_API_KEY')

// ── Admin SDK init ────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp()
const db   = getFirestore()
const auth = getAuth()

// ── Shared handler ────────────────────────────────────────────────────────────
async function handleTrainingDeleted(
  sourceType: 'community' | 'park',
  sourceId: string,
  trainingId: string,
  deletedData: Record<string, unknown>,
) {
  const firestorePath = sourceType === 'community'
    ? `communities/${sourceId}/trainings/${trainingId}`
    : `parks/${sourceId}/trainings/${trainingId}`

  const trainingName = (deletedData.name as string) ?? 'Unknown training'
  const now = new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })

  // Fetch source name (community or park)
  let sourceName = sourceId
  try {
    const sourceDoc = await db.doc(
      sourceType === 'community' ? `communities/${sourceId}` : `parks/${sourceId}`
    ).get()
    sourceName = sourceDoc.data()?.name ?? sourceId
  } catch { /* keep ID as fallback */ }

  // ── 1. Write audit record ──────────────────────────────────────────────────
  await db.collection('admin_alerts').add({
    type: 'TRAINING_HARD_DELETED',
    sourceType,
    sourceId,
    trainingId,
    trainingName,
    sourceName,
    deletedData,
    detectedAt: FieldValue.serverTimestamp(),
    firestorePath,
  })

  // ── 2. In-app notification to superadmin ───────────────────────────────────
  const superadminEmail = SUPERADMIN_EMAIL.value()
  let superadminUid: string | null = null
  try {
    const user = await auth.getUserByEmail(superadminEmail)
    superadminUid = user.uid
  } catch {
    console.error(`[alert] Could not find superadmin UID for ${superadminEmail}`)
  }

  if (superadminUid) {
    await db.collection('notifications').doc(superadminUid).collection('items').add({
      type: 'TRAINING_DELETED',
      title: 'Training hard-deleted',
      body: `"${trainingName}" from ${sourceName} was permanently deleted from Firestore.`,
      isRead: false,
      relatedId: sourceId,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  // ── 3. Alert email via Resend ──────────────────────────────────────────────
  const resendKey = RESEND_API_KEY.value()
  if (resendKey) {
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: 'CaliPal <noreply@calipal.ro>',
      to: superadminEmail,
      subject: `[ALERT] Training hard-deleted: ${trainingName}`,
      html: buildAlertEmailHtml({
        trainingName,
        sourceName,
        sourceType,
        deletedAt: now,
        firestorePath,
        deletedData,
      }),
    })
  }

  console.log(`[alert] Training hard-deleted: ${firestorePath}`)
}

// ── Community trainings trigger ───────────────────────────────────────────────
export const onTrainingDeletedCommunity = onDocumentDeleted(
  {
    document: 'communities/{communityId}/trainings/{trainingId}',
    secrets: [SUPERADMIN_EMAIL, RESEND_API_KEY],
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return
    await handleTrainingDeleted(
      'community',
      event.params.communityId,
      event.params.trainingId,
      data,
    )
  },
)

// ── Park trainings trigger ────────────────────────────────────────────────────
export const onTrainingDeletedPark = onDocumentDeleted(
  {
    document: 'parks/{parkId}/trainings/{trainingId}',
    secrets: [SUPERADMIN_EMAIL, RESEND_API_KEY],
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return
    await handleTrainingDeleted(
      'park',
      event.params.parkId,
      event.params.trainingId,
      data,
    )
  },
)

// ── Inline email template ─────────────────────────────────────────────────────
function buildAlertEmailHtml(params: {
  trainingName: string
  sourceName: string
  sourceType: 'community' | 'park'
  deletedAt: string
  firestorePath: string
  deletedData: Record<string, unknown>
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const rows = [
    ['Training', esc(params.trainingName)],
    ['Source', `${esc(params.sourceName)} (${params.sourceType})`],
    ['Firestore Path', `<code style="font-size:12px;">${esc(params.firestorePath)}</code>`],
    ['Detected At', esc(params.deletedAt)],
  ]

  const tableRows = rows
    .map(([label, value]) =>
      `<tr>
        <td style="padding:8px 12px;color:#9CA3AF;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:8px 12px;color:#F9FAFB;font-size:13px;">${value}</td>
      </tr>`)
    .join('')

  // Stringify deleted data for audit
  let dataJson: string
  try {
    dataJson = esc(JSON.stringify(params.deletedData, null, 2))
  } catch {
    dataJson = '[could not serialize]'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training Deleted Alert</title></head>
<body style="margin:0;padding:0;background:#0D2E2B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D2E2B;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" style="max-width:520px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;text-align:center;">
          <span style="display:inline-block;background:#1ED75F18;border:1px solid #1ED75F30;border-radius:14px;padding:10px 20px;">
            <span style="color:#1ED75F;font-size:20px;font-weight:900;letter-spacing:-0.5px;">CaliPal</span>
          </span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#164742;border-radius:20px;padding:28px;border:1px solid rgba(255,255,255,0.08);">

          <!-- Alert badge -->
          <div style="margin:0 0 20px;">
            <span style="display:inline-block;background:#EF444420;border:1px solid #EF444440;border-radius:8px;padding:4px 12px;">
              <span style="color:#EF4444;font-size:12px;font-weight:700;letter-spacing:0.5px;">TRAINING DELETED</span>
            </span>
          </div>

          <!-- Title -->
          <h1 style="margin:0 0 20px;color:#F9FAFB;font-size:20px;font-weight:900;line-height:1.3;">
            A training was permanently deleted from Firestore
          </h1>

          <!-- Details table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.08);margin-bottom:24px;">
            ${tableRows}
          </table>

          <!-- Deleted data dump -->
          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            <p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;font-weight:700;">DELETED DOCUMENT DATA</p>
            <pre style="margin:0;padding:12px;background:#0D2E2B;border-radius:8px;color:#D1D5DB;font-size:11px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${dataJson}</pre>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 8px;text-align:center;">
          <p style="margin:0;color:#4B5563;font-size:12px;">This is an automated admin alert from CaliPal.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
