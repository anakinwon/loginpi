import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com'

export interface PaymentReceiptOptions {
  to: string
  displayName: string
  paymentId: string
  amount: number
  memo: string
  completedAt: Date
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildReceiptHtml(opts: PaymentReceiptOptions): string {
  const { displayName, paymentId, amount, memo, completedAt } = opts
  const dateStr = completedAt.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Pi 결제 영수증</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">π 결제 완료</h1>
              <p style="margin:8px 0 0;color:#ddd6fe;font-size:13px;">Pi Network Payment Receipt</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;color:#374151;font-size:15px;">안녕하세요, <strong>${esc(displayName)}</strong>님</p>
              <p style="margin:0 0 32px;color:#6b7280;font-size:14px;line-height:1.6;">Pi Network 결제가 성공적으로 완료되었습니다.<br>아래는 결제 내역입니다.</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:24px;text-align:center;margin-bottom:32px;">
                <p style="margin:0 0 6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">결제 금액</p>
                <p style="margin:0;color:#16a34a;font-size:40px;font-weight:700;">${amount}&nbsp;π</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px;">
                <tr>
                  <td style="padding:14px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;width:110px;white-space:nowrap;">
                    <span style="color:#6b7280;font-weight:600;">결제 ID</span>
                  </td>
                  <td style="padding:14px 20px;background:#fff;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#111827;font-family:'Courier New',monospace;font-size:12px;word-break:break-all;">${esc(paymentId)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-weight:600;">내용</span>
                  </td>
                  <td style="padding:14px 20px;background:#fff;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#111827;">${memo ? esc(memo) : '—'}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;background:#f9fafb;">
                    <span style="color:#6b7280;font-weight:600;">완료 일시</span>
                  </td>
                  <td style="padding:14px 20px;background:#fff;">
                    <span style="color:#111827;">${esc(dateStr)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                본 메일은 Pi Network 결제 완료 시 자동 발송되는 영수증입니다.<br>
                문의사항이 있으시면 서비스 고객센터로 연락해 주세요.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendPaymentReceipt(opts: PaymentReceiptOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `[결제 완료] ${opts.amount} π 결제가 완료되었습니다`,
    html: buildReceiptHtml(opts),
  })
}
