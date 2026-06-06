import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentReceipt } from '@/lib/email'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export async function POST(request: NextRequest) {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'PI_API_KEY 미설정 — Pi Developer Portal에서 발급 후 환경변수에 추가하세요' },
      { status: 500 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { paymentId, txid } = body as { paymentId?: string; txid?: string }
  if (!paymentId || !txid) {
    return NextResponse.json({ error: 'paymentId와 txid가 필요합니다' }, { status: 400 })
  }

  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Pi 완료 처리 실패 (${res.status}): ${text}` },
        { status: res.status }
      )
    }
    const payment = (await res.json()) as PaymentDTO

    const db = getSupabaseAdmin()

    // approve에서 생성된 row를 completed 상태로 업데이트
    await db
      .from('pi_pymnt')
      .update({ txid, status: 'completed', mod_dtm: new Date().toISOString() })
      .eq('payment_id', paymentId)

    // 구글 계정 연동 사용자에게 결제 영수증 이메일 발송 (비동기 — 실패해도 결제 응답에 영향 없음)
    if (payment.user_uid) {
      void (async () => {
        try {
          const { data: u } = await db
            .from('sys_user')
            .select('google_email, display_name')
            .eq('pi_uid', payment.user_uid)
            .maybeSingle()
          if (u?.google_email) {
            await sendPaymentReceipt({
              to: u.google_email,
              displayName: u.display_name ?? u.google_email,
              paymentId,
              amount: payment.amount,
              memo: payment.memo ?? '',
              completedAt: new Date(),
            })
          }
        } catch (e) {
          console.error('결제 영수증 이메일 발송 실패:', e)
        }
      })()
    }

    return NextResponse.json({ success: true, payment })
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }
}
