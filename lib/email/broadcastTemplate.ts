/** Generates the HTML email body for a super-admin broadcast / news email. */
export function broadcastEmailHtml({
  recipientName,
  subject,
  body,
  appUrl,
}: {
  recipientName: string
  subject: string
  body: string
  appUrl: string
}): string {
  const firstName = recipientName.split(' ')[0]
  const greeting = firstName
    ? `Salut, <strong style="color:#F9FAFB;">${escHtml(firstName)}</strong>! 👋`
    : 'Salut! 👋'

  // Convert newlines to <br> for HTML display
  const bodyHtml = escHtml(body).replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(subject)}</title></head>
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
          <p style="margin:0 0 20px;color:#9CA3AF;font-size:15px;line-height:1.5;">${greeting}</p>

          <!-- Subject -->
          <h1 style="margin:0 0 20px;color:#F9FAFB;font-size:20px;font-weight:900;line-height:1.3;">${escHtml(subject)}</h1>

          <!-- Body -->
          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;margin-bottom:24px;">
            <p style="margin:0;color:#D1D5DB;font-size:14px;line-height:1.8;">${bodyHtml}</p>
          </div>

          <!-- CTA -->
          <a href="${appUrl}" style="display:block;background:#1ED75F;color:#000;text-align:center;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:900;text-decoration:none;">
            Deschide CaliPal →
          </a>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 8px;text-align:center;">
          <p style="margin:0 0 6px;color:#4B5563;font-size:12px;">Ai primit acest email deoarece ești utilizator CaliPal și ai activat notificările pentru noutăți.</p>
          <p style="margin:0;color:#374151;font-size:12px;">Poți dezactiva notificările din <strong>Profil → Setări → Notificări Email</strong>.</p>
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
