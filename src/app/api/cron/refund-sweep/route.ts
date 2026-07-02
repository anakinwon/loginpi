import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { refundCancelledOrder } from '@/lib/mps-refund'

// 취소 주문 자동 환불 안전망 cron — 플랫폼 무개입 전략(2026-07-02 마스터 확정).
// 취소 시점의 즉시 환불(A2U)이 일시 실패(시드 미반영·네트워크 등)로 pending에 머문 건을
// 주기적으로 자동 재시도한다. 사람이 환불 버튼을 누르는 개입 자체를 없애는 것이 목적.
// 멱등: refundCancelledOrder가 REFUND_IN 존재 시 ALREADY_REFUNDED skip → 중복 송금 없음.

const SWEEP_WINDOW_HOURS = 48 // 최근 취소분만 — 과거 잔재 소급은 관리자가 명시적으로(환불 버튼)
const SWEEP_LIMIT = 20 // 실행당 A2U 상한 — cron 주기당 부하 제한

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ⛔ 명시적 옵트인 게이트 (2026-07-02 스테이징 소급 환불 사고 재발방지):
  // 돈이 나가는 자동화는 마스터가 환경별로 직접 켠 곳에서만 돈다.
  // 운영(cafepi)에만 REFUND_SWEEP_ENABLED=true 설정 — 스테이징·프리뷰는 미설정=비활성.
  if (process.env.REFUND_SWEEP_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, disabled: true, refunded: 0 })
  }

  const db = getSupabaseAdmin()
  const since = new Date(
    Date.now() - SWEEP_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString()

  // 환불 후보 — 결제 완료(escrow_txid 보유)된 취소 주문
  const { data: orders, error } = await db
    .from('mps_order')
    .select('order_id')
    .eq('order_st_cd', 'CANCELLED')
    .not('escrow_txid', 'is', null)
    .gte('mod_dtm', since)
    .order('mod_dtm', { ascending: true })
    .limit(SWEEP_LIMIT * 3) // REFUND_IN 제외 전 여유분
  if (error) {
    console.error('[cron/refund-sweep] 후보 조회 실패:', error.message)
    return NextResponse.json(
      { ok: false, error: 'query_failed' },
      { status: 500 },
    )
  }
  const candidateIds = (orders ?? []).map((o) => o.order_id as string)
  if (candidateIds.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, refunded: 0 })
  }

  // 이미 환불된 주문 제외 (REFUND_IN 존재)
  const { data: refunded } = await db
    .from('mps_txn_hist')
    .select('order_id')
    .eq('txn_type_cd', 'REFUND_IN')
    .in('order_id', candidateIds)
  const doneSet = new Set((refunded ?? []).map((r) => r.order_id as string))
  const targets = candidateIds
    .filter((id) => !doneSet.has(id))
    .slice(0, SWEEP_LIMIT)

  // 순차 실행 — 같은 앱 지갑의 동시 서명은 시퀀스 충돌(tx_bad_seq) 위험이 있어 병렬 금지
  let ok = 0
  let pending = 0
  const failures: Array<{ orderId: string; reason: string }> = []
  for (const orderId of targets) {
    try {
      const r = await refundCancelledOrder(orderId, 'SYSTEM')
      if (r.status === 'refunded') ok++
      else if (r.status === 'pending') {
        pending++
        failures.push({
          orderId,
          reason: `${r.reason}${'detail' in r && r.detail ? `: ${r.detail.slice(0, 120)}` : ''}`,
        })
      }
      // skipped(NOT_PAID·NO_UID 등)는 대상 아님 — 다음 주기에도 동일하므로 카운트만 생략
    } catch (e) {
      pending++
      failures.push({
        orderId,
        reason: e instanceof Error ? e.message.slice(0, 120) : String(e),
      })
    }
  }

  if (failures.length > 0) {
    console.error('[cron/refund-sweep] 미해결 환불:', JSON.stringify(failures))
  }
  return NextResponse.json({
    ok: true,
    scanned: targets.length,
    refunded: ok,
    stillPending: pending,
    failures,
  })
}
