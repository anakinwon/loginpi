import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import {
  getRoom,
  getRoomMember,
  verifyRoomPassword,
  isRoomExpired,
  resolveRoomGrade,
  joinRoomMember,
} from '@/lib/chat'
import { getChatPlan } from '@/lib/chat-auth'
import { getRoomFeeBean, type RoomGrade } from '@/lib/bean-fee'
import { eventEntryFeeBean } from '@/lib/bean-shared'
import { applyBean, getBalance } from '@/lib/bean'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/chat/rooms/[roomId]/join — 공개 그룹방·이벤트방 입장
// 입장료는 전부 Bean 차감([currency-routing-rule] 플랫폼 요금 = Bean):
//   · 그룹방(프리미엄)  → 등급 정액(getRoomFeeBean), 구독자 무료
//   · 이벤트방(E)       → 호스트 지정 티켓가(entry_fee_pi×100), 구독 할인 없음·GUEST 한시 입장
// confirm 없이 들어오면 차감 전 requiresBeanConfirm(402)로 소진 동의를 먼저 받는다.
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

  // 기간이 만료된 카페(무료방 7일 초과 등)는 입장 불가
  if (isRoomExpired(room)) {
    return NextResponse.json(
      { error: '기간이 만료된 카페입니다', expired: true },
      { status: 410 },
    )
  }

  const isEvent = room.room_tp_cd === 'E'

  // 이벤트방 종료 시각 확인
  if (isEvent && room.entry_expire_dtm) {
    if (new Date(room.entry_expire_dtm) <= new Date()) {
      return NextResponse.json(
        { error: '종료된 이벤트입니다' },
        { status: 410 },
      )
    }
  }

  // 이미 멤버면 비밀번호 없이 통과 (재입장 — 내가 만든 방 OWNER 포함 → 무료)
  const existing = await getRoomMember(roomId, user.id)
  if (existing) return NextResponse.json({ message: '이미 카페 멤버입니다' })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const { join_pwd, confirm } = body as {
    join_pwd?: string
    confirm?: boolean
  }

  // 비밀방(is_public_yn='N') 입장 규칙 — 비멤버는 공개방만 입장 가능(page.tsx 불변식과 동일).
  //   · 일반 그룹방 → 비밀번호로만 입장 (미설정 비밀방은 초대/생성자 전용 → 불가)
  //   · 이벤트방   → 비번 체계가 없으므로 비공개 이벤트는 초대/생성자 전용 → 요금 결제로도 우회 불가(IDOR 차단)
  //     (생성자는 위 '이미 멤버'에서 통과하므로 본인 비공개 이벤트 접근은 영향 없음)
  if (room.is_public_yn === 'N') {
    if (isEvent) {
      return NextResponse.json(
        { error: '비공개 이벤트입니다' },
        { status: 403 },
      )
    }
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

  // 입장료(Bean) 산정 — 이벤트방은 호스트 지정가, 그 외는 등급 정액(구독자 무료).
  let enterFeeBean = 0
  let gradeForResp: RoomGrade = 'GENERAL'
  let refTpCd = 'ROOM_ENTER'
  let feeMemo = ''
  let memberOpts:
    | { role: 'MEMBER' | 'GUEST'; expireDtm?: string | null }
    | undefined

  if (isEvent) {
    enterFeeBean = eventEntryFeeBean(room.entry_fee_pi)
    gradeForResp = 'EVENT'
    refTpCd = 'EVENT_ENTER'
    feeMemo = `이벤트방 입장료 (${room.room_nm})`
    // GUEST + 이벤트 종료시각까지 한시 입장
    memberOpts = { role: 'GUEST', expireDtm: room.entry_expire_dtm }
  } else {
    const grade = await resolveRoomGrade(room)
    const plan = await getChatPlan(user.id)
    enterFeeBean = getRoomFeeBean('ENTER', grade, plan.tier !== 'FREE')
    gradeForResp = grade
    feeMemo = `${grade} 카페 입장료`
  }

  if (enterFeeBean > 0) {
    // 소진 사전 안내 — confirm 없이 들어오면 차감하지 않고 입장 여부를 먼저 묻는다.
    if (confirm !== true) {
      const balance = await getBalance(user.id)
      return NextResponse.json(
        {
          requiresBeanConfirm: true,
          feeBean: enterFeeBean,
          balance,
          grade: gradeForResp,
        },
        { status: 402 },
      )
    }
    const charge = await applyBean({
      usrId: user.id,
      txnTp: 'SPEND',
      beanAmt: -enterFeeBean,
      refTp: refTpCd,
      refId: roomId,
      memo: feeMemo,
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

  // 재가입 시 논리삭제된 과거 멤버십을 복구(upsert) — blind INSERT의 중복키 실패 방지
  const { error } = await joinRoomMember(
    roomId,
    user.id,
    user.display_name,
    memberOpts,
  )

  if (error) {
    // 멤버 삽입 실패 시 입장료 환불 (정원은 위에서 검증 — 드문 경합 대비)
    if (enterFeeBean > 0) {
      await applyBean({
        usrId: user.id,
        txnTp: 'REFUND',
        beanAmt: enterFeeBean,
        refTp: refTpCd,
        refId: roomId,
        memo: `${feeMemo} 입장 실패 환불`,
        regrId: user.display_name.slice(0, 20),
      })
    }
    return NextResponse.json({ error: '입장 실패' }, { status: 500 })
  }
  return NextResponse.json({ message: '입장 성공' }, { status: 201 })
}
