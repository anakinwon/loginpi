import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { reverseGeocode } from '@/lib/google-maps'
import { apiError } from '@/lib/api-errors'

// Rule LBS-02: 서버에서 동의 재검증 — 클라이언트 캐시와 관계없이 DB 상태 기준
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  // 동의하지 않은 사용자는 403 반환 (Rule LBS-02)
  if (user.lbs_consent_yn !== 'Y') {
    return apiError('LOC_CONSENT_REQUIRED', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const {
    loc_tp_cd,
    lat,
    lng,
    accuracy_m,
    full_addr,
    sido_nm,
    sigungu_nm,
    dong_nm,
    place_id,
    ref_id,
  } = body as {
    loc_tp_cd?: string
    lat?: number
    lng?: number
    accuracy_m?: number
    full_addr?: string
    sido_nm?: string
    sigungu_nm?: string
    dong_nm?: string
    place_id?: string
    ref_id?: string
  }

  if (!loc_tp_cd || lat === undefined || lng === undefined) {
    return apiError('LOC_SAVE_FIELDS_REQUIRED', 400)
  }

  const VALID_LOC_TYPES = ['01', '02', '03', '04'] as const
  if (!(VALID_LOC_TYPES as readonly string[]).includes(loc_tp_cd)) {
    return apiError('LOC_TP_CD_INVALID', 400)
  }

  // WGS84 좌표 범위 검증
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return apiError('LOC_INVALID_COORD', 400)
  }

  // 행정구역 자동 보강 — 클라이언트가 시도/시군구/동/주소를 하나도 안 보냈을 때만
  // 서버에서 reverseGeocode로 채운다(좌표→주소). 실패해도 위치 저장은 진행(best-effort).
  // 주변 채팅방/매장 표시에 시군구 단위가 필요하므로 로그인 위치(02)에 특히 유용.
  let resolvedFullAddr = full_addr ?? null
  let resolvedSido = sido_nm ?? null
  let resolvedSigungu = sigungu_nm ?? null
  let resolvedDong = dong_nm ?? null
  let resolvedPlaceId = place_id ?? null

  const hasNoRegion =
    !resolvedSido && !resolvedSigungu && !resolvedDong && !resolvedFullAddr
  if (hasNoRegion) {
    try {
      const geo = await reverseGeocode(lat, lng)
      if (geo) {
        resolvedFullAddr = geo.full_addr
        resolvedSido = geo.components.sido_nm
        resolvedSigungu = geo.components.sigungu_nm
        resolvedDong = geo.components.dong_nm
        resolvedPlaceId = resolvedPlaceId ?? geo.place_id
      }
    } catch (err) {
      // Geocoding 실패(키 미설정·할당량 등)는 무시 — 좌표만으로 저장 지속
      console.error(
        '[location/save] reverseGeocode 실패:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  const now = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from('usr_loc_hist')
    .insert({
      user_str_id: user.id,
      loc_tp_cd,
      // API 입력 lat/lng → DB 표준용어 latd_crd/lngt_crd
      latd_crd: lat,
      lngt_crd: lng,
      accuracy_m: accuracy_m ?? null,
      full_addr: resolvedFullAddr,
      sido_nm: resolvedSido,
      sigungu_nm: resolvedSigungu,
      dong_nm: resolvedDong,
      place_id: resolvedPlaceId,
      ref_id: ref_id ?? null,
      consent_yn: 'Y',
      consent_dtm: user.lbs_consent_dtm ?? now,
      regr_id: user.id,
      modr_id: user.id,
    })
    .select('loc_hist_id')
    .single()

  if (error) {
    return apiError('LOC_SAVE_FAILED', 500)
  }

  return NextResponse.json({ ok: true, loc_hist_id: data.loc_hist_id })
}
