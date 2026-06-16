import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  findVerifiedShopByPlaceId,
  createGpsVerifiedShop,
} from '@/lib/mps-shop'

// POST /api/store/shops/claim — 구글 카페를 내 PiShop 매장으로 GPS 자동인증 등록
//
// 설계 (GPS 자동승인 + place_id 강제 매핑):
//   1. 로그인 + LBS 동의 필수 (현장 GPS 필요)
//   2. 구글 place_id 강제 매핑 (이 값 없이는 등록 불가)
//   3. 현장 검증: 사용자 GPS ↔ 선택한 place 좌표 거리 ≤ CLAIM_RADIUS_M
//   4. place_id 중복 검사 → 통과 시 owner_verified_yn='Y' 자동 등록
//
// "한 카페 = 한 주인"은 DB 부분 유니크 인덱스(uq_mps_shop_place_verified)가 최종 강제.

// 현장 인증 허용 반경(m) — 도심 GPS 오차·실내 측위 저하 감안 100m
// (너무 빡빡하면 정상 사장님도 실패. 추후 env 승격 가능)
const CLAIM_RADIUS_M = 100

const claimSchema = z.object({
  place_id: z.string().min(1).max(500),
  shop_nm: z.string().min(1).max(200),
  addr: z.string().max(500).optional(),
  // 구글 place 좌표 (매장 위치)
  place_lat: z.number().min(-90).max(90),
  place_lng: z.number().min(-180).max(180),
  // 신청자 현재 GPS (현장 검증용)
  user_lat: z.number().min(-90).max(90),
  user_lng: z.number().min(-180).max(180),
  biz_hour: z.string().max(200).optional(),
  contact_tel: z.string().max(50).optional(),
})

// Haversine 거리(m) — nearby/shops와 동일 공식, 단위만 m
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 현장 GPS가 전제 — LBS 미동의자는 현장 검증 불가
  if (user.lbs_consent_yn !== 'Y') {
    return NextResponse.json(
      { error: '위치기반서비스 동의가 필요합니다 (현장 위치 확인)' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = claimSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', detail: parsed.error.issues },
      { status: 400 },
    )
  }
  const c = parsed.data

  // ① 현장 검증 — 선택한 카페 좌표와 신청자 현재 위치가 가까운가
  const distanceM = haversineMeters(
    c.user_lat,
    c.user_lng,
    c.place_lat,
    c.place_lng,
  )
  if (distanceM > CLAIM_RADIUS_M) {
    return NextResponse.json(
      {
        error: `매장에서 ${Math.round(distanceM)}m 떨어져 있습니다. 매장 ${CLAIM_RADIUS_M}m 이내에서 다시 시도해주세요.`,
        code: 'TOO_FAR',
        distance_m: Math.round(distanceM),
      },
      { status: 422 },
    )
  }

  // ② place_id 중복 사전 검사 (DB 유니크 인덱스가 최종 강제, 친절한 안내)
  const existing = await findVerifiedShopByPlaceId(c.place_id)
  if (existing) {
    const mine = existing.seller_id === user.id
    return NextResponse.json(
      {
        error: mine
          ? '이미 내가 등록한 매장입니다'
          : '이미 다른 사용자가 등록·인증한 매장입니다',
        code: mine ? 'ALREADY_MINE' : 'ALREADY_CLAIMED',
        shop_id: mine ? existing.shop_id : undefined,
      },
      { status: 409 },
    )
  }

  // ③ 자동 인증 등록
  const slug = String(user.display_name ?? 'user').slice(0, 20)
  try {
    const shop = await createGpsVerifiedShop(user.id, slug, {
      place_id: c.place_id,
      shop_nm: c.shop_nm,
      addr: c.addr ?? null,
      lat: c.place_lat,
      lng: c.place_lng,
      biz_hour: c.biz_hour ?? null,
      contact_tel: c.contact_tel ?? null,
    })

    // 매장 위치 이력 기록 (loc_tp_cd='03'=매장, 비블로킹) — DA 표준 컬럼 latd_crd/lngt_crd
    getSupabaseAdmin()
      .from('usr_loc_hist')
      .insert({
        user_str_id: user.id,
        loc_tp_cd: '03',
        latd_crd: c.place_lat,
        lngt_crd: c.place_lng,
        place_id: c.place_id,
        ref_id: shop.shop_id,
        consent_yn: 'Y',
        consent_dtm: new Date().toISOString(),
        regr_id: slug,
        modr_id: slug,
      })
      .then(({ error }) => {
        if (error) console.error('[매장 위치 이력] 기록 실패:', error.message)
      })

    return NextResponse.json({ shop }, { status: 201 })
  } catch (e) {
    // place_id 부분 유니크 위반 — 동시 등록 race condition 최종 방어
    const code = (e as { code?: string })?.code
    if (code === '23505') {
      return NextResponse.json(
        { error: '이미 다른 사용자가 등록·인증한 매장입니다', code: 'ALREADY_CLAIMED' },
        { status: 409 },
      )
    }
    const msg = e instanceof Error ? e.message : '매장 등록 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
