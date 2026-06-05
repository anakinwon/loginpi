import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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

    // approve에서 생성된 row를 completed 상태로 업데이트
    await getSupabaseAdmin()
      .from('payments')
      .update({ txid, status: 'completed', updated_at: new Date().toISOString() })
      .eq('payment_id', paymentId)

    return NextResponse.json({ success: true, payment })
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }
}
