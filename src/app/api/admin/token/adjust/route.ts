import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { applyBean } from '@/lib/bean'

// 수동 조정 사유 화이트리스트 — 어뷰징 방지
const ALLOWED_REASONS = [
  'REFUND_PI_PAYMENT', // Pi 결제 환불 보상
  'REWARD_EVENT', // 이벤트 보상
  'REWARD_PROMOTION', // 프로모션 보상
  'CORRECTION_OVERPAY', // 과충전 정정
  'CORRECTION_UNDERPAY', // 미충전 정정
  'PENALTY_ABUSE', // 어뷰징 패널티
  'TEST_ADMIN', // 관리자 테스트
] as const

type AdjustReason = (typeof ALLOWED_REASONS)[number]

interface AdjustBody {
  usr_id: string
  adj_bean: number // 양수=지급, 음수=차감
  reason: AdjustReason
  evidence_url?: string
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as Partial<AdjustBody>

  if (
    !body.usr_id ||
    typeof body.adj_bean !== 'number' ||
    body.adj_bean === 0
  ) {
    return NextResponse.json(
      { error: 'usr_id와 adj_bean(0 제외)은 필수입니다' },
      { status: 400 },
    )
  }
  if (!body.reason || !ALLOWED_REASONS.includes(body.reason as AdjustReason)) {
    return NextResponse.json(
      {
        error: `reason은 다음 중 하나여야 합니다: ${ALLOWED_REASONS.join(', ')}`,
      },
      { status: 400 },
    )
  }
  // evidence_url — javascript:/data: Stored XSS 차단: http(s)만 허용, 길이 상한
  if (body.evidence_url !== undefined && body.evidence_url !== null) {
    if (body.evidence_url.length > 2048) {
      return NextResponse.json(
        { error: 'evidence_url이 너무 깁니다 (최대 2048자)' },
        { status: 400 },
      )
    }
    try {
      const u = new URL(body.evidence_url)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return NextResponse.json(
          { error: 'evidence_url은 http(s) URL만 허용합니다' },
          { status: 400 },
        )
      }
    } catch {
      return NextResponse.json(
        { error: 'evidence_url이 유효한 URL이 아닙니다' },
        { status: 400 },
      )
    }
  }

  const db = getSupabaseAdmin()

  // 현재 잔액 조회 (감사 로그용)
  const { data: wallet } = await db
    .from('bean_token_wallet')
    .select('bean_amt')
    .eq('usr_id', body.usr_id)
    .eq('wallet_type', 'USER')
    .maybeSingle()

  const before = Number((wallet as { bean_amt: number } | null)?.bean_amt ?? 0)

  // fn_bean_apply로 원자적 적용 (PLATFORM 지갑 동기화 포함)
  const txnTp = body.adj_bean > 0 ? 'CHARGE' : 'SPEND'
  const result = await applyBean({
    usrId: body.usr_id,
    txnTp,
    beanAmt: body.adj_bean,
    memo: `[어드민 수동조정] ${body.reason}`,
    regrId: user!.id,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Bean 조정 실패' },
      { status: result.error === 'INSUFFICIENT_BEAN' ? 422 : 500 },
    )
  }

  const after = result.balance ?? 0

  // 감사 로그 기록
  await db.from('bean_audit_log').insert({
    usr_id: body.usr_id,
    adj_before: before,
    adj_bean: body.adj_bean,
    adj_after: after,
    reason_txt: body.reason,
    adj_admin_id: user!.id,
    evidence_url: body.evidence_url ?? null,
    regr_id: user!.id,
    modr_id: user!.id,
  })

  return NextResponse.json({
    ok: true,
    before,
    adj: body.adj_bean,
    after,
  })
}
