import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { canCreateRoom, getChatPlan } from '@/lib/chat-auth'
import { createEventRoom } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordUserAction } from '@/lib/event'
import { getRoomFeeBean } from '@/lib/bean-fee'
import { applyBean, getBalance } from '@/lib/bean'
import { getActiveFeeMode } from '@/lib/fee-resolver'

// POST /api/chat/rooms/event — 이벤트 카페 생성
// Business 플랜 폐지: 그룹방 PREMIUM과 동일하게 구독·Bean 요금만 체크한다.
//   구독자(PREMIUM/운영자) → 패키지 할인으로 무료, 비구독자(FREE) → EVENT 생성료 Bean 결제.
// 참가자는 entry_fee_pi(Bean) 소진 후 payments/complete에서 GUEST 입장 처리
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 구독 여부로 생성료 판정 (그룹방 PREMIUM 테마 처리와 동일 패턴).
  // canCreateRoom.allowed=true → 구독자(월 무제한 무료) → 생성료 0,
  // false → 비구독자 → EVENT 카페 생성료를 Bean으로 결제.
  const plan = await getChatPlan(user.id)
  const allowance = await canCreateRoom(user.id, plan)
  const feeMode = await getActiveFeeMode()
  let createFeeBean = 0
  if (!allowance.allowed) {
    createFeeBean = getRoomFeeBean('CREATE', 'EVENT', false)
    // BEAN 모드만 Bean 잔액 확인. PI 모드는 Pi 직결제(아래 분기).
    if (feeMode === 'BEAN') {
      const bal = await getBalance(user.id)
      if (bal < createFeeBean) {
        return NextResponse.json(
          {
            error: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
            requiresBean: true,
            feeBean: createFeeBean,
            balance: bal,
          },
          { status: 402 },
        )
      }
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const {
    room_nm,
    room_desc,
    theme_cd,
    is_public_yn,
    max_mbr_cnt,
    entry_fee_pi,
    entry_expire_dtm,
    lat,
    lng,
  } = body as {
    room_nm?: string
    room_desc?: string
    theme_cd?: string
    is_public_yn?: 'Y' | 'N'
    max_mbr_cnt?: number
    entry_fee_pi?: number
    entry_expire_dtm?: string
    lat?: number
    lng?: number
  }

  if (!room_nm?.trim())
    return NextResponse.json(
      { error: '방 이름을 입력해주세요' },
      { status: 400 },
    )
  if (!theme_cd)
    return NextResponse.json({ error: '테마를 선택해주세요' }, { status: 400 })
  if (!entry_expire_dtm)
    return NextResponse.json(
      { error: '이벤트 종료 시각을 설정해주세요' },
      { status: 400 },
    )
  if (new Date(entry_expire_dtm) <= new Date()) {
    return NextResponse.json(
      { error: '이벤트 종료 시각은 현재 시각보다 이후여야 합니다' },
      { status: 400 },
    )
  }

  // PI 모드 유료 이벤트방 — Bean 차감 대신 Pi 직결제. 방은 결제 완료(complete) 시 생성한다.
  if (createFeeBean > 0 && feeMode === 'PI') {
    return NextResponse.json({
      mode: 'PI',
      pay: {
        amount: createFeeBean / 100, // 1 Pi = 100 Bean
        memo: 'PICAFE event room create',
        metadata: {
          type: 'EVENT_ROOM_CREATE',
          theme_cd,
          room_nm: room_nm.trim(),
          room_desc: room_desc?.trim() || null,
          is_public_yn: is_public_yn ?? 'Y',
          max_mbr_cnt: typeof max_mbr_cnt === 'number' ? max_mbr_cnt : 100,
          entry_fee_pi: typeof entry_fee_pi === 'number' ? entry_fee_pi : 0,
          entry_expire_dtm,
          lat: typeof lat === 'number' ? lat : null,
          lng: typeof lng === 'number' ? lng : null,
        },
      },
    })
  }

  try {
    const room = await createEventRoom({
      userId: user.id,
      displayName: user.display_name,
      theme_cd,
      room_nm: room_nm.trim(),
      room_desc: room_desc?.trim() || null,
      is_public_yn: is_public_yn ?? 'Y',
      max_mbr_cnt: typeof max_mbr_cnt === 'number' ? max_mbr_cnt : 100,
      entry_fee_pi: typeof entry_fee_pi === 'number' ? entry_fee_pi : 0,
      entry_expire_dtm,
    })

    // 비구독자 EVENT 카페 생성료 Bean 차감 (refId=room_id로 원장 추적).
    // 동시성 등으로 차감 실패 시 방을 논리삭제해 롤백 (그룹방 group/route와 동일).
    if (createFeeBean > 0) {
      const charge = await applyBean({
        usrId: user.id,
        txnTp: 'SPEND',
        beanAmt: -createFeeBean,
        refTp: 'ROOM_CREATE',
        refId: room.room_id,
        memo: `이벤트 카페 생성료 (${room_nm.trim()})`,
        regrId: user.display_name.slice(0, 20),
      })
      if (!charge.ok) {
        await getSupabaseAdmin()
          .from('msg_room')
          .update({ del_yn: 'Y', del_dtm: new Date().toISOString() })
          .eq('room_id', room.room_id)
        return NextResponse.json(
          {
            error: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
            requiresBean: true,
            feeBean: createFeeBean,
          },
          { status: 402 },
        )
      }
    }

    // M5: 이벤트방 카페 생성 미션 기록 (비블로킹)
    recordUserAction('event_cafe_create', user.id, {
      roomId: room.room_id,
    }).catch((err) =>
      console.error(`[M5] event_cafe_create 기록 실패: ${err.message}`),
    )

    // LBS 동의자 이벤트방 위치 저장 (loc_tp_cd='05' 카페생성) — 비블로킹
    const validLat =
      typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90
    const validLng =
      typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
    if (validLat && validLng && user.lbs_consent_yn === 'Y') {
      const db = getSupabaseAdmin()
      const slug = String(user.display_name ?? 'user').slice(0, 20)
      Promise.all([
        db
          .from('msg_room')
          .update({ latd_crd: lat, lngt_crd: lng })
          .eq('room_id', room.room_id),
        db.from('usr_loc_hist').insert({
          user_str_id: user.id,
          loc_tp_cd: '05',
          latd_crd: lat,
          lngt_crd: lng,
          ref_id: room.room_id,
          consent_yn: 'Y',
          consent_dtm: new Date().toISOString(),
          regr_id: slug,
          modr_id: slug,
        }),
      ]).catch((err) =>
        console.error('[이벤트방 위치] 저장 실패:', err.message),
      )
    }

    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '이벤트방 생성 실패' }, { status: 500 })
  }
}
