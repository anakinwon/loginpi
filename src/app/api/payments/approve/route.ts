import { NextRequest, NextResponse } from 'next/server'

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

  const { paymentId } = body as { paymentId?: string }
  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId가 필요합니다' }, { status: 400 })
  }

  // TODO: 실서비스에서는 여기서 DB 주문과 금액/사용자 대조 검증 필수
  // const payment = await fetchPaymentFromPi(paymentId, apiKey)
  // const order = await db.orders.findByPaymentId(paymentId)
  // if (!order || order.amount !== payment.amount) return 400

  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,   // ⚠️ Bearer 아닌 Key
      },
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Pi 승인 실패 (${res.status}): ${text}` },
        { status: res.status }
      )
    }
    const payment = (await res.json()) as PaymentDTO
    return NextResponse.json({ success: true, payment })
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }
}
