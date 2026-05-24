const categoryLabels: Record<string, Record<string, string>> = {
  improvement: { RO: '💡 Îmbunătățire', EN: '💡 Improvement' },
  bug:         { RO: '🐛 Raport Bug',   EN: '🐛 Bug Report' },
  feedback:    { RO: '💬 Feedback',     EN: '💬 Feedback' },
  other:       { RO: '📝 Altele',       EN: '📝 Other' },
}

const categoryColors: Record<string, string> = {
  improvement: '#3B82F6',
  bug:         '#EF4444',
  feedback:    '#1ED75F',
  other:       '#9CA3AF',
}

/** Default prefix shown before the admin's reply body. */
export function getDefaultPrefix(lang: 'RO' | 'EN', recipientName: string, originalSubject: string): string {
  if (lang === 'RO') {
    return `Bună ${recipientName},\n\nÎți mulțumim că ai luat legătura cu echipa CaliPal! Apreciem feedback-ul tău și ne bucurăm să-ți oferim cel mai bun suport posibil.\n\nReferitor la mesajul tău „${originalSubject}", iată răspunsul nostru:`
  }
  return `Hello ${recipientName},\n\nThank you for reaching out to the CaliPal team! We truly appreciate your feedback and are happy to provide you with the best support possible.\n\nRegarding your message "${originalSubject}", here is our response:`
}

/** Default suffix shown after the admin's reply body. */
export function getDefaultSuffix(lang: 'RO' | 'EN'): string {
  if (lang === 'RO') {
    return `Dacă mai ai întrebări sau nelămuriri, nu ezita să ne scrii din nou!\n\nRămâi cât mai puternic și continuă să te antrenezi! 💪\n\nCu drag,\nEchipa CaliPal 🌿`
  }
  return `If you have any more questions or concerns, don't hesitate to reach out again!\n\nStay as strong as possible and keep training! 💪\n\nWith love,\nThe CaliPal Team 🌿`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function nl2br(s: string): string {
  return escHtml(s).replace(/\n/g, '<br>')
}

/** Generates the full HTML email for a superadmin reply to a user's feedback. */
export function feedbackReplyHtml({
  lang,
  recipientName,
  originalSubject,
  originalMessage,
  category,
  replyBody,
  appUrl,
}: {
  lang: 'RO' | 'EN'
  recipientName: string
  originalSubject: string
  originalMessage: string
  category: string
  replyBody: string
  appUrl: string
}): string {
  const prefix = getDefaultPrefix(lang, recipientName, originalSubject)
  const suffix = getDefaultSuffix(lang)
  const accent = categoryColors[category] ?? '#1ED75F'
  const catLabel = (categoryLabels[category] ?? {})[lang] ?? category

  const subjectLine = lang === 'RO'
    ? `Răspuns la feedback-ul tău — ${escHtml(originalSubject)}`
    : `Reply to your feedback — ${escHtml(originalSubject)}`

  const originalLabel = lang === 'RO' ? 'Mesajul tău original' : 'Your original message'

  return `<!DOCTYPE html>
<html lang="${lang.toLowerCase()}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subjectLine}</title></head>
<body style="margin:0;padding:0;background:#0D2E2B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D2E2B;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" style="max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;text-align:center;">
          <span style="display:inline-block;background:#1ED75F18;border:1px solid #1ED75F30;border-radius:14px;padding:10px 22px;">
            <span style="color:#1ED75F;font-size:22px;font-weight:900;letter-spacing:-0.5px;">CaliPal</span>
          </span>
        </td></tr>

        <!-- Category badge -->
        <tr><td style="padding-bottom:16px;text-align:center;">
          <span style="display:inline-block;background:${accent}22;border:1px solid ${accent}44;border-radius:999px;padding:6px 16px;color:${accent};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
            ${catLabel}
          </span>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background:#164742;border-radius:20px;padding:28px;border:1px solid rgba(255,255,255,0.08);">

          <!-- Subject -->
          <h1 style="margin:0 0 6px;color:#F9FAFB;font-size:20px;font-weight:900;line-height:1.3;">${escHtml(originalSubject)}</h1>
          <p style="margin:0 0 24px;color:#6B7280;font-size:13px;">${lang === 'RO' ? 'Răspuns de la echipa CaliPal' : 'A reply from the CaliPal team'}</p>

          <!-- Prefix -->
          <p style="margin:0 0 20px;color:#D1D5DB;font-size:14px;line-height:1.75;white-space:pre-wrap;">${nl2br(prefix)}</p>

          <!-- Admin reply body -->
          <div style="background:#0D2E2B;border-radius:14px;padding:18px 20px;margin-bottom:20px;border:1px solid ${accent}33;border-left:3px solid ${accent};">
            <p style="margin:0;color:#F9FAFB;font-size:14px;line-height:1.75;white-space:pre-wrap;">${nl2br(replyBody)}</p>
          </div>

          <!-- Suffix -->
          <p style="margin:0 0 28px;color:#D1D5DB;font-size:14px;line-height:1.75;white-space:pre-wrap;">${nl2br(suffix)}</p>

          <!-- Divider -->
          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;">
            <p style="margin:0 0 10px;color:#4B5563;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escHtml(originalLabel)}</p>
            <div style="background:#0D2E2B;border-radius:10px;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.65;white-space:pre-wrap;">${nl2br(originalMessage)}</p>
            </div>
          </div>

        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:24px 0 8px;text-align:center;">
          <a href="${escHtml(appUrl)}" style="display:inline-block;background:#1ED75F;color:#000;font-weight:900;font-size:13px;padding:12px 28px;border-radius:14px;text-decoration:none;">
            ${lang === 'RO' ? 'Deschide CaliPal' : 'Open CaliPal'}
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 0 8px;text-align:center;">
          <p style="margin:0;color:#374151;font-size:12px;line-height:1.6;">CaliPal · ${escHtml(appUrl.replace('https://', ''))}</p>
          <p style="margin:4px 0 0;color:#374151;font-size:11px;">${lang === 'RO' ? 'Ai primit acest email deoarece ai trimis un feedback în aplicație.' : 'You received this email because you submitted feedback in the app.'}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
