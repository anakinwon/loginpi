import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { transferBean, getTipPresets } from '@/lib/bean'
import { broadcastToRoom } from '@/lib/realtime-broadcast'
import { recordUserAction } from '@/lib/event'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { withGuard } from '@/lib/api-guard'

// 카페방 P2P Bean 선물 — Pi 결제가 아닌 Bean 실전송(USER→USER).
// 보내는 사람 Bean 차감 + 받는 사람 적립을 fn_bean_transfer로 원자적 수행 후 TIP_NOTI 알림.
// 허용 금액은 런타임 프리셋(getTipPresets)을 읽어 관리자 화면 변경과 즉시 일치 — UI/검증 단일 출처.

async function handlePOST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // Bean 선물은 모든 사용자 허용 — 자기 Bean을 보내는 P2P 전송이라 구독 게이트 없음.
  // (잔액 부족은 transferBean이 INSUFFICIENT_BEAN으로 차단)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { room_id, recipient_id, amount } = body as {
    room_id?: string
    recipient_id?: string
    amount?: number
  }

  if (!room_id || !recipient_id || amount === undefined) {
    return NextResponse.json(
      { error: 'room_id, recipient_id, amount가 필요합니다' },
      { status: 400 },
    )
  }

  // 고정 프리셋 + 직접입력(1~상한)을 통합 검증 — 정수·양수·상한 이내. 프리셋은 상한 이하라 자동 포함.
  const tipCfg = await getTipPresets()
  if (!Number.isInteger(amount) || amount <= 0 || amount > tipCfg.customMax) {
    return NextResponse.json(
      {
        error: `1 ~ ${tipCfg.customMax.toLocaleString()} Bean 사이 정수만 가능합니다`,
      },
      { status: 400 },
    )
  }

  if (recipient_id === user.id) {
    return NextResponse.json(
      { error: '자기 자신에게 Bean을 보낼 수 없습니다' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()

  const [{ data: recipient }, { data: senderMbr }, { data: recipientMbr }] =
    await Promise.all([
      db
        .from('sys_user')
        .select('id, display_name')
        .eq('id', recipient_id)
        .maybeSingle(),
      db
        .from('msg_room_mbr')
        .select('room_id')
        .eq('room_id', room_id)
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .maybeSingle(),
      db
        .from('msg_room_mbr')
        .select('room_id')
        .eq('room_id', room_id)
        .eq('usr_id', recipient_id)
        .eq('del_yn', 'N')
        .maybeSingle(),
    ])

  if (!recipient) {
    return NextResponse.json(
      { error: '수신자를 찾을 수 없습니다' },
      { status: 404 },
    )
  }
  if (!senderMbr) {
    return NextResponse.json(
      { error: '해당 카페에 참여 중이 아닙니다' },
      { status: 403 },
    )
  }
  if (!recipientMbr) {
    return NextResponse.json(
      { error: '수신자가 해당 카페에 없습니다' },
      { status: 400 },
    )
  }

  // 직거래 문의방(Direct)에서는 Bean/Pi 선물 금지 — 거래 당사자 간 금전 선물 차단(요건).
  //   Bean 실전송·PI 선물 파라미터 발급 모두 이 진입점을 거치므로 여기서 두 경로를 함께 막는다.
  const { data: giftRoom } = await db
    .from('msg_room')
    .select('theme_cd')
    .eq('room_id', room_id)
    .maybeSingle()
  if ((giftRoom as { theme_cd?: string } | null)?.theme_cd === 'DIRECT') {
    return NextResponse.json(
      { error: '직거래 문의방에서는 선물을 보낼 수 없습니다' },
      { status: 403 },
    )
  }

  const recipientRow = recipient as { id: string; display_name: string | null }
  const senderNm = user.display_name ?? 'user'
  const recipientNm = recipientRow.display_name ?? 'user'
  const slug = String(senderNm).slice(0, 20)

  // PI 모드 — Bean 직접 전송(U2U) 불가 → 앱 경유: 보내는 사람 U2A 결제 후 앱이 받는 사람에 A2U.
  //   여기선 결제 파라미터만 반환, 실제 선물 확정·송금은 complete의 PI_TIP 분기. PRD_24 §0.
  const feeMode = await getActiveFeeMode()
  if (feeMode === 'PI') {
    return NextResponse.json({
      mode: 'PI',
      pay: {
        amount: amount / 100, // 1 Pi = 100 Bean
        memo: 'PICAFE tip',
        metadata: {
          type: 'PI_TIP',
          recipient_id: recipientRow.id,
          room_id,
          bean_amount: amount,
        },
      },
    })
  }

  // Bean 실전송 (USER→USER 원자적 이전)
  const result = await transferBean({
    fromUsrId: user.id,
    toUsrId: recipientRow.id,
    beanAmt: amount,
    refId: room_id,
    memo: `@${senderNm} → @${recipientNm} ${amount} Bean`,
    regrId: slug,
  })

  if (!result.ok) {
    const insufficient = result.error === 'INSUFFICIENT_BEAN'
    return NextResponse.json(
      {
        error: insufficient
          ? 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.'
          : 'Bean 전송에 실패했습니다',
        requiresBean: insufficient,
      },
      { status: insufficient ? 402 : 500 },
    )
  }

  // TIP_NOTI 알림 메시지 삽입 + 실시간 브로드캐스트
  const { data: tipMsg } = await db
    .from('msg_msg')
    .insert({
      room_id,
      snd_usr_id: user.id,
      snd_usr_nm: senderNm,
      msg_cont: `${senderNm} 님이 ${recipientNm} 님께 ${amount} Bean을 선물했습니다`,
      msg_tp_cd: 'TIP_NOTI',
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  if (tipMsg) {
    await broadcastToRoom(room_id, 'new_msg', tipMsg)

    // M4: Bean 전송 미션 기록 (비블로킹)
    recordUserAction('bean_send', user.id, {
      room_id,
      recipient_id: recipientRow.id,
    }).catch((err) => console.error(`[M4] 미션 기록 실패: ${err.message}`))
  }

  return NextResponse.json({
    ok: true,
    amount,
    recipient_nm: recipientNm,
    from_balance: result.fromBalance,
  })
}

export const POST = withGuard(handlePOST)
