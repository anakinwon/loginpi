import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { withGuard } from '@/lib/api-guard'
import { apiError } from '@/lib/api-errors'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export const POST = withGuard(async function (request: NextRequest) {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    console.error(
      '[payments/approve] PI_API_KEY 미설정 — Pi Developer Portal에서 발급 후 환경변수에 추가하세요',
    )
    return apiError('SERVER_CONFIG', 500)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { paymentId } = body as { paymentId?: string }
  if (!paymentId) {
    return apiError('PAY_PAYMENT_ID_REQUIRED', 400)
  }

  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!res.ok) {
      const text = await res.text()
      // already_approved: 이미 승인된 결제 재요청 — 멱등성 처리 (오류 아님)
      try {
        const errData = JSON.parse(text) as {
          error?: string
          payment?: PaymentDTO
        }
        if (errData.error === 'already_approved' && errData.payment) {
          const payment = errData.payment
          const db = getSupabaseAdmin()
          const { data: user } = await db
            .from('sys_user')
            .select('id')
            .eq('pi_uid', payment.user_uid)
            .single()
          if (user) {
            await db.from('pi_pymnt').upsert(
              {
                payment_id: payment.identifier,
                user_id: user.id,
                amount: payment.amount,
                memo: payment.memo,
                metadata: payment.metadata,
                status: 'approved',
                mod_dtm: new Date().toISOString(),
              },
              { onConflict: 'payment_id' },
            )
          }
          return NextResponse.json({ success: true, payment })
        }
      } catch {
        /* JSON 파싱 실패 시 아래 오류 반환으로 진행 */
      }
      return apiError('PAY_PI_APPROVE_FAILED', res.status, {
        status: res.status,
        detail: text,
      })
    }
    const payment = (await res.json()) as PaymentDTO

    // Pi UID로 sys_user 테이블에서 user.id 조회 후 결제 기록
    const db = getSupabaseAdmin()
    const { data: user } = await db
      .from('sys_user')
      .select('id')
      .eq('pi_uid', payment.user_uid)
      .single()

    if (user) {
      await db.from('pi_pymnt').upsert(
        {
          payment_id: payment.identifier,
          user_id: user.id,
          amount: payment.amount,
          memo: payment.memo,
          metadata: payment.metadata,
          status: 'approved',
          mod_dtm: new Date().toISOString(),
        },
        { onConflict: 'payment_id' },
      )
    }

    return NextResponse.json({ success: true, payment })
  } catch {
    return apiError('PI_API_CONNECT_FAILED', 502)
  }
})
