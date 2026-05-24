/** Generates the HTML email body for a user feedback / suggestion. */
export function feedbackEmailHtml({
  senderName,
  senderEmail,
  category,
  subject,
  message,
  rating,
  communities,
  uid,
  sentAt,
}: {
  senderName: string
  senderEmail: string
  category: string
  subject: string
  message: string
  rating?: number
  communities: string[]
  uid: string
  sentAt: string
}): string {
  const categoryColors: Record<string, string> = {
    improvement: '#3B82F6',
    bug:         '#EF4444',
    feedback:    '#1ED75F',
    other:       '#9CA3AF',
  }
  const categoryLabels: Record<string, string> = {
    improvement: '💡 Improvement',
    bug:         '🐛 Bug Report',
    feedback:    '💬 Feedback',
    other:       '📝 Other',
  }
  const accent = categoryColors[category] ?? '#1ED75F'
  const categoryLabel = categoryLabels[category] ?? category

  const starsHtml = rating
    ? `<p style="margin:0 0 16px;">
        ${Array.from({ length: 5 }, (_, i) =>
          `<span style="font-size:20px;color:${i < rating ? '#FFB800' : '#374151'};">★</span>`
        ).join('')}
        <span style="color:#6B7280;font-size:13px;margin-left:8px;">${rating}/5</span>
      </p>`
    : ''

  const commHtml = communities.length > 0
    ? `<tr>
        <td style="padding:6px 0;color:#6B7280;font-size:13px;white-space:nowrap;">👥 Communities</td>
        <td style="padding:6px 0 6px 16px;color:#F9FAFB;font-size:13px;">${escHtml(communities.join(', '))}</td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CaliPal Feedback — ${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#0D2E2B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D2E2B;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" style="max-width:540px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;text-align:center;">
          <span style="display:inline-block;background:#1ED75F18;border:1px solid #1ED75F30;border-radius:14px;padding:10px 20px;">
            <span style="color:#1ED75F;font-size:20px;font-weight:900;letter-spacing:-0.5px;">CaliPal</span>
          </span>
        </td></tr>

        <!-- Category badge -->
        <tr><td style="padding-bottom:16px;text-align:center;">
          <span style="display:inline-block;background:${accent}22;border:1px solid ${accent}44;border-radius:999px;padding:6px 16px;color:${accent};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
            ${categoryLabel}
          </span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#164742;border-radius:20px;padding:28px;border:1px solid rgba(255,255,255,0.08);">

          <!-- Subject -->
          <h1 style="margin:0 0 6px;color:#F9FAFB;font-size:20px;font-weight:900;line-height:1.3;">${escHtml(subject)}</h1>
          <p style="margin:0 0 20px;color:#6B7280;font-size:13px;">New feedback from a CaliPal user</p>

          <!-- Star rating -->
          ${starsHtml}

          <!-- Message -->
          <div style="background:#0D2E2B;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;color:#D1D5DB;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escHtml(message)}</p>
          </div>

          <!-- User info table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            <tr>
              <td style="padding:6px 0;color:#6B7280;font-size:13px;white-space:nowrap;">👤 Name</td>
              <td style="padding:6px 0 6px 16px;color:#F9FAFB;font-size:13px;font-weight:600;">${escHtml(senderName)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6B7280;font-size:13px;white-space:nowrap;">📧 Email</td>
              <td style="padding:6px 0 6px 16px;font-size:13px;">
                <a href="mailto:${escHtml(senderEmail)}" style="color:#3B82F6;text-decoration:none;">${escHtml(senderEmail)}</a>
              </td>
            </tr>
            ${commHtml}
            <tr>
              <td style="padding:6px 0;color:#6B7280;font-size:13px;white-space:nowrap;">🔑 UID</td>
              <td style="padding:6px 0 6px 16px;color:#4B5563;font-size:12px;font-family:monospace;">${escHtml(uid)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6B7280;font-size:13px;white-space:nowrap;">🕐 Sent at</td>
              <td style="padding:6px 0 6px 16px;color:#6B7280;font-size:13px;">${escHtml(sentAt)}</td>
            </tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 8px;text-align:center;">
          <p style="margin:0;color:#4B5563;font-size:12px;">CaliPal Admin · This email was sent automatically to the super admin only.</p>
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
