import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { withGuard } from '@/lib/api-guard'
import { apiError } from '@/lib/api-errors'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

// 결제 취소 처리: Pi SDK의 onCancel/onError 콜백에서 호출.
// 잔액 부족·사용자 취소 등으로 결제가 중단되면 approve 단계에서 기록된
// 'approved' row가 그대로 굳어 관리자 화면에 "승인"으로 남는 문제를 방지한다.
async function handlePOST(request: NextRequest) {
  // 인증 필수 — IDOR 방지. 본인 결제만 취소할 수 있어야 한다.
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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

  const db = getSupabaseAdmin()

  // (1) 소유권 검증 — payment_id로 row를 조회해 본인 결제인지 확인한다.
  //     approve가 아직 기록하지 않아 row가 없으면(즉시 취소 등) 정정할 대상도 없으므로 조용히 종료.
  const { data: row } = await db
    .from('pi_pymnt')
    .select('user_id, status')
    .eq('payment_id', paymentId)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ success: true, updated: false })
  }
  if (row.user_id !== user.id) {
    // 타인 결제에 대한 취소 시도 — 거부
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // (2) Pi Network 측 취소 — best-effort. 사용자가 지갑에서 이미 취소했거나
  //     완료된 결제라 실패할 수 있으나, 로컬 상태 정합성이 본 라우트의 핵심이므로 무시한다.
  const apiKey = process.env.PI_API_KEY
  if (apiKey) {
    try {
      await fetch(`${PI_PAYMENTS_URL}/${paymentId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Key ${apiKey}` },
      })
    } catch {
      /* Pi API 연결 실패는 무시 — 로컬 상태 갱신을 우선한다 */
    }
  }

  // (3) 로컬 pi_pymnt 상태 갱신 — 완료된 결제는 보호(덮어쓰기 금지).
  //     본인 소유 + pending·approved 상태인 건만 cancelled로 전이한다.
  try {
    await db
      .from('pi_pymnt')
      .update({ status: 'cancelled', mod_dtm: new Date().toISOString() })
      .eq('payment_id', paymentId)
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])
  } catch {
    return apiError('PAY_STATUS_UPDATE_FAILED', 500)
  }

  return NextResponse.json({ success: true, updated: true })
}

export const POST = withGuard(handlePOST)
