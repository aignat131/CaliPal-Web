/** Generates the HTML email body for a training announcement. */
export function trainingEmailHtml({
  recipientName,
  trainingName,
  communityName,
  dateLabel,
  timeLabel,
  location,
  description,
  authorName,
  trainingUrl,
  unsubscribeUrl,
}: {
  recipientName: string
  trainingName: string
  communityName: string
  dateLabel: string
  timeLabel: string
  location: string
  description: string
  authorName: string
  trainingUrl: string
  unsubscribeUrl: string
}): string {
  const firstName = recipientName.split(' ')[0]
  const greeting = firstName
    ? `Salut, <strong style="color:#F9FAFB;">${escHtml(firstName)}</strong>! 👋`
    : 'Salut! 👋'

  const descHtml = description
    ? `<p style="margin:0 0 20px;color:#9CA3AF;font-size:14px;line-height:1.6;">${escHtml(description)}</p>`
    : ''

  const locationHtml = location
    ? `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px;">📍 Locație</td><td style="padding:6px 0 6px 16px;color:#F9FAFB;font-size:13px;font-weight:600;">${escHtml(location)}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Antrenament nou în ${escHtml(communityName)}</title></head>
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
        <tr><td style="background:#164742;border-radius:20px;padding:28px;border:1px solid #1ED75F20;">

          <!-- Greeting -->
          <p style="margin:0 0 20px;color:#9CA3AF;font-size:15px;line-height:1.5;">${greeting}<br>
          <span style="color:#6B7280;font-size:13px;">Un antrenament nou a fost adăugat în comunitatea ta.</span></p>

          <!-- Community badge -->
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#1ED75F;letter-spacing:2px;text-transform:uppercase;">${escHtml(communityName)}</p>

          <!-- Title -->
          <h1 style="margin:0 0 6px;color:#F9FAFB;font-size:22px;font-weight:900;line-height:1.2;">${escHtml(trainingName)}</h1>
          <p style="margin:0 0 20px;color:#6B7280;font-size:13px;">Organizat de ${escHtml(authorName)}</p>

          <!-- Details table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;">📅 Data</td><td style="padding:6px 0 6px 16px;color:#F9FAFB;font-size:13px;font-weight:600;">${escHtml(dateLabel)}</td></tr>
            <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;">🕐 Oră</td><td style="padding:6px 0 6px 16px;color:#F9FAFB;font-size:13px;font-weight:600;">${escHtml(timeLabel)}</td></tr>
            ${locationHtml}
          </table>

          ${descHtml}

          <!-- CTA -->
          <p style="margin:0 0 20px;color:#D1D5DB;font-size:15px;font-weight:600;">Participi la antrenament?</p>
          <a href="${trainingUrl}" style="display:block;background:#1ED75F;color:#000;text-align:center;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:900;text-decoration:none;letter-spacing:0.2px;">
            Vezi antrenamentul →
          </a>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 8px;text-align:center;">
          <p style="margin:0 0 8px;color:#4B5563;font-size:12px;">Ai primit acest email deoarece ești membru al comunității <strong style="color:#6B7280;">${escHtml(communityName)}</strong> pe CaliPal.</p>
          <a href="${unsubscribeUrl}" style="color:#374151;font-size:12px;text-decoration:underline;">Dezabonare notificări email</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
