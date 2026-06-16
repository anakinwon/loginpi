import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getChatPlan } from '@/lib/chat-auth'
import { createEventRoom } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordUserAction } from '@/lib/event'

// POST /api/chat/rooms/event — 이벤트 카페 생성 (Business 플랜 전용)
// 참가자는 entry_fee_pi 결제 후 payments/complete에서 GUEST 입장 처리
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const plan = await getChatPlan(user.id)
  if (!plan.caps.canCreateEventRoom) {
    return NextResponse.json(
      { error: '이벤트 카페는 Business 플랜 전용입니다' },
      { status: 403 },
    )
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

    // M5: 이벤트방 카페 생성 미션 기록 (비블로킹)
    recordUserAction('event_cafe_create', user.id, {
      roomId: room.room_id,
    }).catch((err) =>
      console.error(`[M5] event_cafe_create 기록 실패: ${err.message}`),
    )

    // LBS 동의자 이벤트방 위치 저장 (loc_tp_cd='05' 카페생성) — 비블로킹
    const validLat = typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90
    const validLng = typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180
    if (validLat && validLng && user.lbs_consent_yn === 'Y') {
      const db = getSupabaseAdmin()
      const slug = String(user.display_name ?? 'user').slice(0, 20)
      Promise.all([
        db.from('msg_room').update({ latd_crd: lat, lngt_crd: lng }).eq('room_id', room.room_id),
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
      ]).catch(err => console.error('[이벤트방 위치] 저장 실패:', err.message))
    }

    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '이벤트방 생성 실패' }, { status: 500 })
  }
}
