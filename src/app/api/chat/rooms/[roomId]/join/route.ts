import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoom, getRoomMember, verifyRoomPassword } from '@/lib/chat'
import { getChatPlan } from '@/lib/chat-auth'
import { getRoomGrade, getRoomFeeBean } from '@/lib/bean-fee'
import { applyBean } from '@/lib/bean'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/chat/rooms/[roomId]/join — 공개 그룹방 입장
// 유료 입장(이벤트방)은 TASK-053 결제 연동 후 처리
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const room = await getRoom(roomId)
  if (!room)
    return NextResponse.json(
      { error: '카페를 찾을 수 없습니다' },
      { status: 404 },
    )

  // Direct Room은 join API로 입장 불가 — getOrCreateDirectRoom으로만 생성
  if (room.room_tp_cd === 'D') {
    return NextResponse.json(
      { error: '1:1 카페에는 직접 입장할 수 없습니다' },
      { status: 403 },
    )
  }

  // 이벤트방 만료 확인
  if (room.room_tp_cd === 'E' && room.entry_expire_dtm) {
    if (new Date(room.entry_expire_dtm) <= new Date()) {
      return NextResponse.json(
        { error: '종료된 이벤트입니다' },
        { status: 410 },
      )
    }
  }

  // TASK-063: 유료 이벤트방 — 결제 완료 후 payments/complete에서 GUEST 삽입됨
  // 결제 없이 직접 join 시도 시 402 반환 (클라이언트가 Pi SDK 결제 흐름으로 안내)
  if (room.room_tp_cd === 'E' && room.entry_fee_pi > 0) {
    const existing = await getRoomMember(roomId, user.id)
    if (existing) return NextResponse.json({ message: '이미 카페 멤버입니다' })
    return NextResponse.json(
      {
        error: '유료 이벤트방입니다. 결제 후 입장하세요.',
        requiresPayment: true,
        entryFeePi: room.entry_fee_pi,
      },
      { status: 402 },
    )
  }

  // 이미 멤버면 비밀번호 없이 통과 (재입장)
  const existing = await getRoomMember(roomId, user.id)
  if (existing) return NextResponse.json({ message: '이미 카페 멤버입니다' })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const { join_pwd } = body as { join_pwd?: string }

  // 비밀방(is_public_yn='N')은 비밀번호로만 입장 가능
  // 비밀번호 미설정(join_pwd_hash=null) 비밀방은 초대/생성자 전용 → 입장 불가
  if (room.is_public_yn === 'N') {
    if (!room.join_pwd_hash) {
      return NextResponse.json({ error: '비공개 카페입니다' }, { status: 403 })
    }
    if (
      !join_pwd ||
      !verifyRoomPassword(String(join_pwd), room.join_pwd_hash)
    ) {
      return NextResponse.json(
        { error: '비밀번호가 일치하지 않습니다', requiresPassword: true },
        { status: 401 },
      )
    }
  }

  // 정원 확인
  const { count } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_mbr_id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('del_yn', 'N')

  if ((count ?? 0) >= room.max_mbr_cnt) {
    return NextResponse.json(
      { error: '카페 정원이 가득 찼습니다' },
      { status: 409 },
    )
  }

  // 입장료 — 구독자 무료, 비구독자는 등급별 Bean 결제 ([currency-routing-rule] 플랫폼 요금 = Bean).
  // 내가 만든 방(OWNER) 재입장은 위에서 '이미 멤버'로 통과되므로 여기까지 오지 않음 = 무료.
  const grade = getRoomGrade(room.room_tp_cd, room.theme_cd)
  const plan = await getChatPlan(user.id)
  const enterFeeBean = getRoomFeeBean('ENTER', grade, plan.tier !== 'FREE')
  if (enterFeeBean > 0) {
    const charge = await applyBean({
      usrId: user.id,
      txnTp: 'SPEND',
      beanAmt: -enterFeeBean,
      refTp: 'ROOM_ENTER',
      refId: roomId,
      memo: `${grade} 카페 입장료`,
      regrId: user.display_name.slice(0, 20),
    })
    if (!charge.ok) {
      return NextResponse.json(
        {
          error: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
          requiresBean: true,
          feeBean: enterFeeBean,
        },
        { status: 402 },
      )
    }
  }

  const { error } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .insert({
      room_id: roomId,
      usr_id: user.id,
      mbr_role_cd: 'MEMBER',
      regr_id: user.display_name.slice(0, 20),
      modr_id: user.display_name.slice(0, 20),
    })

  if (error) {
    // 멤버 삽입 실패 시 입장료 환불 (정원은 위에서 검증 — 드문 경합 대비)
    if (enterFeeBean > 0) {
      await applyBean({
        usrId: user.id,
        txnTp: 'REFUND',
        beanAmt: enterFeeBean,
        refTp: 'ROOM_ENTER',
        refId: roomId,
        memo: `${grade} 카페 입장 실패 환불`,
        regrId: user.display_name.slice(0, 20),
      })
    }
    return NextResponse.json({ error: '입장 실패' }, { status: 500 })
  }
  return NextResponse.json({ message: '입장 성공' }, { status: 201 })
}
