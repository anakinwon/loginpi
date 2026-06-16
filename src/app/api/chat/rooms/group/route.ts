import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { canCreateRoom } from '@/lib/chat-auth'
import { createGroupRoom } from '@/lib/chat'
import { recordUserAction } from '@/lib/event'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 무료 테마(FITNESS) 또는 구독자의 월 무료 쿼터 내에서는 결제 없이 그룹방 생성 가능
// 서버에서 화이트리스트·구독 권한 검증 — 클라이언트 우회 방지
const FREE_THEME_CODES = new Set(['FITNESS'])

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

  if (!FREE_THEME_CODES.has(theme_cd)) {
    const allowance = await canCreateRoom(user.id)
    if (!allowance.allowed) {
      return NextResponse.json(
        { error: '이 테마는 결제가 필요합니다' },
        { status: 403 },
      )
    }
  }
  if (!room_nm?.trim()) {
    return NextResponse.json(
      { error: '카페 이름을 입력해 주세요' },
      { status: 400 },
    )
  }

  try {
    const room = await createGroupRoom({
      userId: user.id,
      displayName: user.display_name,
      theme_cd,
      room_nm: room_nm.trim(),
      room_desc: room_desc?.trim() || null,
      is_public_yn: is_public_yn ?? 'Y',
      max_mbr_cnt: typeof max_mbr_cnt === 'number' ? max_mbr_cnt : 50,
      expr_dtm: expr_dtm ?? null,
    })

    // M3: PREMIUM Cafe 생성 미션 기록 (비블로킹)
    // 무료 테마(FITNESS)는 PREMIUM 카페가 아니므로 미션에서 제외 — 무료 생성으로 M3 우회 차단
    if (!FREE_THEME_CODES.has(theme_cd)) {
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

    // LBS 동의자 카페 위치 저장 (loc_tp_cd='05' 카페생성) — 비블로킹
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
      ]).catch(err => console.error('[카페 위치] 저장 실패:', err.message))
    }

    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '카페 생성 실패' }, { status: 500 })
  }
}
