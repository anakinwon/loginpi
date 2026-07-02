import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendA2U, isA2UEnabled } from '@/lib/pi-a2u'

// POST /api/admin/payments/[id]/refund — 관리자 수동 환불 (pi_pymnt 단건, 전액)
// 입금 확인된(completed) U2A 결제를 공식 A2U 흐름(create→submit→complete)으로 되돌려준다.
// 멱등: 원 결제 metadata.refund를 원자적으로 선점(claim)해 이중클릭·중복 환불을 차단하고,
//       실패(error) 상태만 재시도를 허용한다. 성공 시 ADMIN_REFUND 행을 장부에 남긴다.

interface RefundMeta {
  status: 'processing' | 'completed' | 'error'
  txid?: string
  payment_id?: string
  amount?: number
  error?: string
  by: string
  at: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getSessionUser()
  if (!isAdmin(admin))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!isA2UEnabled())
    return NextResponse.json(
      { error: 'A2U 비활성 (PI_API_KEY/PI_WALLET_PRIVATE_SEED 미설정)' },
      { status: 503 },
    )

  const { id } = await params
  const db = getSupabaseAdmin()

  const { data: pymnt } = await db
    .from('pi_pymnt')
    .select('id, payment_id, user_id, amount, status, metadata')
    .eq('id', id)
    .maybeSingle()
  if (!pymnt)
    return NextResponse.json(
      { error: '결제를 찾을 수 없습니다' },
      { status: 404 },
    )

  const meta = (pymnt.metadata ?? {}) as { type?: string; refund?: RefundMeta }
  const amount = Number(pymnt.amount)

  // 환불 대상 검증 — 완료된 양수 금액의 U2A 결제만 (환불 행 자체는 재환불 불가)
  if (
    pymnt.status !== 'completed' ||
    amount <= 0 ||
    meta.type === 'ADMIN_REFUND'
  )
    return NextResponse.json(
      { error: '환불 대상이 아닙니다 (완료된 결제만 환불 가능)' },
      { status: 409 },
    )
  if (meta.refund && meta.refund.status !== 'error')
    return NextResponse.json(
      { error: '이미 환불되었거나 처리 중입니다', refund: meta.refund },
      { status: 409 },
    )

  // A2U 수신자 = 원 결제자의 Pi UID (Google 전용 계정은 A2U 불가)
  const { data: payer } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', pymnt.user_id)
    .maybeSingle()
  const uid = (payer as { pi_uid?: string } | null)?.pi_uid
  if (!uid)
    return NextResponse.json(
      { error: '결제자의 Pi 계정 정보(pi_uid)가 없어 A2U 환불이 불가합니다' },
      { status: 409 },
    )

  const now = new Date().toISOString()
  const adminId = admin!.id

  // 원자적 claim — refund 미기록 또는 이전 시도 실패(error)인 행만 processing으로 선점.
  // 동시 요청은 여기서 0행 매칭되어 중복 송금이 원천 차단된다.
  const { data: claimed } = await db
    .from('pi_pymnt')
    .update({
      metadata: {
        ...meta,
        refund: { status: 'processing', by: adminId, at: now },
      },
      modr_id: adminId,
    })
    .eq('id', id)
    .eq('status', 'completed')
    .or('metadata->refund.is.null,metadata->refund->>status.eq.error')
    .select('id')
  if (!claimed || claimed.length === 0)
    return NextResponse.json(
      { error: '다른 요청이 이미 환불을 처리 중입니다' },
      { status: 409 },
    )

  try {
    // 공식 A2U 3단계 — 앱 지갑 서명·블록체인 제출 (Stellar memo는 ASCII ≤28바이트)
    const a2u = await sendA2U({
      uid,
      amount,
      memo: 'ADMIN refund',
      metadata: {
        type: 'ADMIN_REFUND',
        source_id: pymnt.id,
        source_payment_id: pymnt.payment_id,
      },
    })

    const refund: RefundMeta = {
      status: 'completed',
      txid: a2u.txid,
      payment_id: a2u.paymentId,
      amount,
      by: adminId,
      at: new Date().toISOString(),
    }
    await db
      .from('pi_pymnt')
      .update({ metadata: { ...meta, refund }, modr_id: adminId })
      .eq('id', id)

    // 장부 기록 — 환불 A2U를 별도 행으로 남긴다 (거래구분 REFUND, 총매출 비합산).
    // 금액은 수령액 양수 관례(REFUND_IN과 동일), 원 결제 참조로 소급 추적 가능.
    await db.from('pi_pymnt').insert({
      payment_id: a2u.paymentId,
      txid: a2u.txid,
      user_id: pymnt.user_id,
      amount,
      memo: '↩️ 관리자 환불 (A2U)',
      status: 'completed',
      metadata: {
        type: 'ADMIN_REFUND',
        source_id: pymnt.id,
        source_payment_id: pymnt.payment_id,
      },
      regr_id: adminId,
      modr_id: adminId,
    })

    return NextResponse.json({ refund })
  } catch (e) {
    // 실패 기록 — status:'error'로 남겨 재시도(claim) 가능 상태 유지
    const message = e instanceof Error ? e.message : String(e)
    await db
      .from('pi_pymnt')
      .update({
        metadata: {
          ...meta,
          refund: {
            status: 'error',
            error: message.slice(0, 300),
            by: adminId,
            at: now,
          },
        },
        modr_id: adminId,
      })
      .eq('id', id)
    console.error('[admin/refund] A2U 송금 실패:', id, message)
    return NextResponse.json(
      { error: `A2U 송금 실패: ${message}` },
      { status: 502 },
    )
  }
}
