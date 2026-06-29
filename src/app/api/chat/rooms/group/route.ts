import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { canCreateRoom, getChatPlan } from '@/lib/chat-auth'
import { createGroupRoom } from '@/lib/chat'
import { recordUserAction } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getRoomFeeBean } from '@/lib/bean-fee'
import { applyBean, getBalance } from '@/lib/bean'
import { getActiveFeeMode, applyPromoGate } from '@/lib/fee-resolver'

// 무료 테마(FITNESS) = 일반카페(무료). 그 외 테마 = 프리미엄카페.
// 프리미엄 생성료: 구독자는 패키지 할인으로 무료, 비구독자는 Bean으로 결제.
// 서버에서 화이트리스트·구독 권한 검증 — 클라이언트 우회 방지 ([currency-routing-rule] 플랫폼 요금 = Bean)

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const {
    theme_cd,
    room_nm,
    room_desc,
    is_public_yn,
    max_mbr_cnt,
    expr_dtm,
    lat,
    lng,
  } = body as {
    theme_cd?: string
    room_nm?: string
    room_desc?: string
    is_public_yn?: 'Y' | 'N'
    max_mbr_cnt?: number
    expr_dtm?: string | null
    lat?: number
    lng?: number
  }

  if (!theme_cd) {
    return NextResponse.json({ error: '테마를 선택해 주세요' }, { status: 400 })
  }

  // 테마 등급으로 무료/유료 판정: 일반(BASIC) 테마 그룹 카페는 무료, PREMIUM 테마만 Bean 결제.
  // (구독자는 PREMIUM 테마도 구독 혜택으로 무료)
  const { data: themeRow } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_tp_cd')
    .eq('theme_cd', theme_cd)
    .eq('del_yn', 'N')
    .maybeSingle()
  const isPremiumTheme =
    (themeRow as { theme_tp_cd?: string } | null)?.theme_tp_cd === 'PREMIUM'

  const plan = await getChatPlan(user.id)
  const feeMode = await getActiveFeeMode()
  let createFeeBean = 0
  if (isPremiumTheme) {
    const allowance = await canCreateRoom(user.id, plan)
    if (!allowance.allowed) {
      // 비구독자: 프리미엄 카페 생성료. BEAN 모드는 Bean 잔액 확인, PI 모드는 Pi 직결제(아래 분기).
      let normalFeeBean = getRoomFeeBean('CREATE', 'PREMIUM', false)
      // 오픈기념행사 무료화 게이트 — PRD_26
      createFeeBean = await applyPromoGate(normalFeeBean)
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
  }
  if (!room_nm?.trim()) {
    return NextResponse.json(
      { error: '카페 이름을 입력해 주세요' },
      { status: 400 },
    )
  }

  // 무료로 개설되는 모든 방(생성료 0 Bean — 무료 테마·구독 혜택 무료 생성 포함) = 7일 고정·연장 불가.
  // Bean 결제로 만든 방만 영구(클라이언트 지정 만료일 또는 DB 기본 9999). 기간 선택은 결제 방에만 허용.
  const isFreeRoom = createFeeBean === 0
  const FREE_ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000
  const finalExprDtm = isFreeRoom
    ? new Date(Date.now() + FREE_ROOM_TTL_MS).toISOString()
    : (expr_dtm ?? null)

  // 무료로 개설되는 방은 무조건 공개 + 최대 정원 10명으로 강제 (클라이언트 우회 방지).
  // Bean 결제로 만든 방만 비공개·정원 확대 가능.
  const FREE_ROOM_MAX_MBR = 10
  const reqMaxMbr = typeof max_mbr_cnt === 'number' ? max_mbr_cnt : 50
  const finalPublicYn = isFreeRoom ? 'Y' : (is_public_yn ?? 'Y')
  const finalMaxMbr = isFreeRoom
    ? Math.min(reqMaxMbr, FREE_ROOM_MAX_MBR)
    : reqMaxMbr

  // PI 모드 유료 카페 — Bean 차감 대신 Pi 직결제. 방은 결제 완료(complete) 시 생성한다(미결제 무료 방 방지).
  //   방 설정을 metadata로 운반 → /api/payments/complete의 CHAT_ROOM_CREATE 분기가 createGroupRoom 수행.
  if (createFeeBean > 0 && feeMode === 'PI') {
    return NextResponse.json({
      mode: 'PI',
      pay: {
        amount: createFeeBean / 100, // 1 Pi = 100 Bean
        memo: 'PICAFE room create',
        metadata: {
          type: 'CHAT_ROOM_CREATE',
          theme_cd,
          room_nm: room_nm.trim(),
          room_desc: room_desc?.trim() || null,
          is_public_yn: finalPublicYn,
          max_mbr_cnt: finalMaxMbr,
          expr_dtm: finalExprDtm,
          lat: typeof lat === 'number' ? lat : null,
          lng: typeof lng === 'number' ? lng : null,
        },
      },
    })
  }

  try {
    const room = await createGroupRoom({
      userId: user.id,
      displayName: user.display_name,
      theme_cd,
      room_nm: room_nm.trim(),
      room_desc: room_desc?.trim() || null,
      is_public_yn: finalPublicYn,
      max_mbr_cnt: finalMaxMbr,
      expr_dtm: finalExprDtm,
    })

    // 프리미엄 생성료 Bean 차감 (refId=room_id로 원장 추적). 동시성 등으로 실패 시 방 논리삭제 롤백.
    if (createFeeBean > 0) {
      const charge = await applyBean({
        usrId: user.id,
        txnTp: 'SPEND',
        beanAmt: -createFeeBean,
        refTp: 'ROOM_CREATE',
        refId: room.room_id,
        memo: `프리미엄 카페 생성료 (${room_nm.trim()})`,
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

    // M3: PREMIUM Cafe 생성 미션 기록 (비블로킹)
    // 일반(BASIC) 테마는 PREMIUM 카페가 아니므로 미션에서 제외 — 무료 생성으로 M3 우회 차단
    if (isPremiumTheme) {
      recordUserAction('premium_cafe_create', user.id, {
        theme_cd,
        room_nm,
      }).catch((err) => console.error(`[M3] 미션 기록 실패: ${err.message}`))
    }

    // LBS 동의자 카페 위치 저장 (loc_tp_cd='05' 카페생성) — 비블로킹
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
      ]).catch((err) => console.error('[카페 위치] 저장 실패:', err.message))
    }

    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '카페 생성 실패' }, { status: 500 })
  }
}
