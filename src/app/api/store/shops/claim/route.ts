import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getPlaceDetails, phoneMatches } from '@/lib/google-maps'
import { findVerifiedShopByPlaceId, createVerifiedShop } from '@/lib/mps-shop'

// POST /api/store/shops/claim — 구글 카페를 내 PiShop™ 매장으로 반자동 인증 등록
//
// 설계 (무승인 탈중앙화 + 구글 정보 재입력 대조 half-인증):
//   검증 2종 — place_id(서버 구글 조회 성공) + 전화번호(입력값 == 구글 전화번호)
//   현장 검증 — 사용자 GPS ↔ 구글 좌표 ≤ 100m
//   필수 입력 3종(검증 안 함, 신고 항목) — 대표자명·주소·이메일
//
// 핵심: 클라이언트가 보낸 place 좌표/전화를 신뢰하지 않고, 서버가 place_id로
// 구글 Place Details를 직접 조회해 권위 기준값과 대조한다(위조 차단).
// "한 카페 = 한 주인"은 DB 부분 유니크 인덱스(uq_mps_shop_place_verified)가 최종 강제.

// 현장 인증 허용 반경(m) — 도심 GPS 오차·실내 측위 저하 감안 100m
const CLAIM_RADIUS_M = 100

const claimSchema = z.object({
  place_id: z.string().min(1).max(500),
  // place_id 전체 직접 입력 — 복사 차단 + 대소문자 구분 (무성의 선점 방지)
  place_id_confirm: z.string().min(1).max(500),
  // 신청자 현재 GPS (현장 검증용)
  user_lat: z.number().min(-90).max(90),
  user_lng: z.number().min(-180).max(180),
  // 검증 대상 — 입력값을 구글 전화번호와 대조
  contact_tel: z.string().min(1).max(50),
  // 필수 입력(검증 안 함, 신고 항목) — 비면 거부
  shop_nm: z.string().min(1).max(200),
  owner_nm: z.string().min(1).max(100),
  addr: z.string().min(1).max(500),
  contact_email: z.email().max(200),
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
      {
        error: '매장명·전화번호·대표자명·주소·이메일을 모두 입력해주세요',
        detail: parsed.error.issues,
      },
      { status: 400 },
    )
  }
  const c = parsed.data

  // ⓪ place_id 전체 일치 — 입력값이 place_id와 대소문자까지 정확히 일치해야 함
  //    (복사 차단 + 직접 타이핑. 구글 조회 비용 발생 전 무성의 선점 1차 차단)
  if (c.place_id_confirm !== c.place_id) {
    return NextResponse.json(
      {
        error: 'place_id가 정확히 일치하지 않습니다 (대소문자 구분)',
        code: 'PLACE_ID_MISMATCH',
      },
      { status: 422 },
    )
  }

  // ① 서버가 place_id로 구글 Place Details 직접 조회 (권위 기준값)
  let place
  try {
    place = await getPlaceDetails(c.place_id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '구글 매장 조회 실패'
    return NextResponse.json(
      { error: `매장 정보 조회 실패: ${msg}` },
      { status: 502 },
    )
  }
  if (!place) {
    return NextResponse.json(
      {
        error: '구글에서 해당 매장을 찾을 수 없습니다',
        code: 'PLACE_NOT_FOUND',
      },
      { status: 404 },
    )
  }

  // ② 현장 검증 — 구글 좌표 기준 사용자 현재 위치 ≤ 100m (클라이언트 place 좌표 불신뢰)
  if (place.lat === null || place.lng === null) {
    return NextResponse.json(
      {
        error: '구글에 매장 좌표가 없어 현장 인증할 수 없습니다',
        code: 'NO_PLACE_COORD',
      },
      { status: 422 },
    )
  }
  const distanceM = haversineMeters(
    c.user_lat,
    c.user_lng,
    place.lat,
    place.lng,
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

  // ③ 전화번호 대조 — 입력값 == 구글 전화번호 (검증 가능한 핵심 항목)
  const googlePhone = place.national_phone ?? place.international_phone
  if (!googlePhone) {
    return NextResponse.json(
      {
        error: '구글에 전화번호가 없어 자동 인증할 수 없습니다',
        code: 'NO_PLACE_PHONE',
      },
      { status: 422 },
    )
  }
  if (!phoneMatches(c.contact_tel, googlePhone)) {
    return NextResponse.json(
      {
        error: '입력한 전화번호가 구글에 등록된 매장 전화번호와 다릅니다',
        code: 'PHONE_MISMATCH',
      },
      { status: 422 },
    )
  }

  // ④ place_id 중복 사전 검사 (DB 유니크 인덱스가 최종 강제, 친절한 안내)
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

  // ⑤ 자동 인증 등록 — 매장명·좌표는 구글 권위값 사용
  const slug = String(user.display_name ?? 'user').slice(0, 20)
  try {
    const shop = await createVerifiedShop(user.id, slug, {
      place_id: c.place_id,
      shop_nm: c.shop_nm,
      addr: c.addr,
      lat: place.lat,
      lng: place.lng,
      contact_tel: c.contact_tel,
      owner_nm: c.owner_nm,
      contact_email: c.contact_email,
      biz_hour: place.biz_hours,
      // 구글이 제공하는 모든 정보 보관
      google_nm: place.name,
      website_url: place.website_uri,
      gmap_url: place.google_maps_uri,
      biz_status_cd: place.business_status,
      rating_cnt: place.user_rating_count,
      google_place_json: place.raw,
    })

    // 매장 위치 이력 기록 (loc_tp_cd='03'=매장, 비블로킹) — DA 표준 컬럼 latd_crd/lngt_crd
    getSupabaseAdmin()
      .from('usr_loc_hist')
      .insert({
        user_str_id: user.id,
        loc_tp_cd: '03',
        latd_crd: place.lat,
        lngt_crd: place.lng,
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
        {
          error: '이미 다른 사용자가 등록·인증한 매장입니다',
          code: 'ALREADY_CLAIMED',
        },
        { status: 409 },
      )
    }
    const msg = e instanceof Error ? e.message : '매장 등록 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
