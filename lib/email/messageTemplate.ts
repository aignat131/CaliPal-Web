/** One-time "you have a new message" reminder email. */
export function messageEmailHtml({
  recipientName,
  senderName,
  preview,
  chatUrl,
}: {
  recipientName: string
  senderName: string
  preview: string
  chatUrl: string
}): string {
  const firstName = recipientName.split(' ')[0]
  const greeting = firstName
    ? `Salut, <strong style="color:#F9FAFB;">${escHtml(firstName)}</strong>! 👋`
    : 'Salut! 👋'

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mesaj nou pe CaliPal</title></head>
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

          <!-- Greeting -->
          <p style="margin:0 0 6px;color:#9CA3AF;font-size:15px;line-height:1.5;">${greeting}</p>
          <p style="margin:0 0 20px;color:#6B7280;font-size:13px;">Ai primit un mesaj nou pe CaliPal de la <strong style="color:#D1D5DB;">${escHtml(senderName)}</strong>.</p>

          <!-- Message preview -->
          <div style="background:#0D2E2B;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1ED75F;letter-spacing:1.5px;text-transform:uppercase;">${escHtml(senderName)}</p>
            <p style="margin:0;color:#D1D5DB;font-size:14px;line-height:1.6;">${escHtml(preview)}</p>
          </div>

          <!-- CTA -->
          <a href="${chatUrl}" style="display:block;background:#1ED75F;color:#000;text-align:center;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:900;text-decoration:none;">
            Răspunde →
          </a>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 8px;text-align:center;">
          <p style="margin:0 0 6px;color:#4B5563;font-size:12px;">Primești acest email deoarece ai activat notificările pentru mesaje în CaliPal.</p>
          <p style="margin:0;color:#374151;font-size:12px;">Poți dezactiva notificările pentru mesaje din <strong>Profil → Setări</strong>.</p>
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
