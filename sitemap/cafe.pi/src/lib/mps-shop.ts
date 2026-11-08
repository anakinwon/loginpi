import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// MPS 판매자 매장 CRUD — 좌표는 DB 표준용어 latd_crd/lngt_crd, 외부 계약은 보편표기 lat/lng
// (DA 표준은 DB 모델에만 적용 — 경계에서 별칭/매핑으로 흡수)

// DB select 별칭: 표준 컬럼 → 보편표기. createShop/updateShop/listMyShops 공통 사용
const SHOP_SELECT = '*, lat:latd_crd, lng:lngt_crd'

// API 입력(lat/lng) → DB 컬럼(latd_crd/lngt_crd) 매핑. 좌표 외 필드는 그대로 통과
function toDbCoord<T extends { lat?: number; lng?: number }>(input: T) {
  const { lat, lng, ...rest } = input
  return {
    ...rest,
    ...(lat !== undefined ? { latd_crd: lat } : {}),
    ...(lng !== undefined ? { lngt_crd: lng } : {}),
  }
}

// 이용후기 동의 플래그가 명시 전달되면 동의/철회 일시를 함께 기록 (lbs_consent_dtm 패턴)
function consentStamp(input: { fbck_consent_yn?: string }) {
  return input.fbck_consent_yn !== undefined
    ? { fbck_consent_dtm: new Date().toISOString() }
    : {}
}

export interface MpsShop {
  shop_id: string
  seller_id: string
  shop_nm: string
  shop_type_cd: 'ONLINE' | 'OFFLINE' | 'BOTH'
  shop_desc: string | null
  addr: string | null
  lat: number | null
  lng: number | null
  biz_hour: string | null
  contact_tel: string | null
  contact_email: string | null
  sns_url: string | null
  thumb_url: string | null
  reg_dtm: string
  // 인증·구글 정보 (읽기전용 식별자 포함)
  place_id: string | null
  owner_nm: string | null
  owner_verified_yn: string | null
  verify_method_cd: string | null
  google_nm: string | null
  website_url: string | null
  gmap_url: string | null
  biz_status_cd: string | null
  rating_cnt: number | null
  google_place_json: unknown
  dlvr_yn: string | null
  // 이용후기·Bean 보상 지급 동의 (opt-in) — Y인 매장의 상품만 후기 허용
  fbck_consent_yn: string | null
  fbck_consent_dtm: string | null
}

export interface ShopInput {
  shop_nm: string
  shop_type_cd: string
  shop_desc?: string
  addr?: string
  lat?: number
  lng?: number
  biz_hour?: string
  contact_tel?: string
  contact_email?: string
  sns_url?: string
  thumb_url?: string
  // 구글 제공 정보 (수정 가능) — place_id·인증상태는 수정 대상 아님
  owner_nm?: string
  google_nm?: string
  website_url?: string
  gmap_url?: string
  biz_status_cd?: string
  rating_cnt?: number
  dlvr_yn?: string
  // 이용후기·Bean 보상 지급 동의 (점주 설정) — 'Y' 전환 시 동의 일시 자동 기록
  fbck_consent_yn?: string
}

// 내 매장 목록 — 한 사용자가 여러 매장 등록 가능(seller_id 유니크 제약 없음)
// sellerId=null → 전체 매장(관리자 전체보기 전용 — 호출자가 isAdmin 검증 후 null 전달)
export async function listMyShops(sellerId: string | null) {
  let q = getSupabaseAdmin()
    .from('mps_shop')
    .select(SHOP_SELECT)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
  if (sellerId) q = q.eq('seller_id', sellerId)
  const { data, error } = await q

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MpsShop[]
}

export async function createShop(
  sellerId: string,
  regrId: string,
  input: ShopInput,
) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .insert({
      ...toDbCoord(input),
      ...consentStamp(input),
      seller_id: sellerId,
      regr_id: regrId,
      modr_id: regrId,
    })
    .select(SHOP_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as MpsShop
}

export async function updateShop(
  shopId: string,
  sellerId: string,
  patch: Partial<ShopInput>,
) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .update({
      ...toDbCoord(patch),
      ...consentStamp(patch),
      modr_id: sellerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('shop_id', shopId)
    .eq('seller_id', sellerId) // 본인 매장만
    .eq('del_yn', 'N')
    .select(SHOP_SELECT)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as MpsShop | null) ?? null
}

// 활성 매장 1개 이상 보유 여부 — 프로필 기본 탭(내 PyShop™) 포커싱 판정용.
// head:true로 행 미전송(존재 여부만) — 목록 조회보다 가볍다.
export async function hasAnyShop(sellerId: string): Promise<boolean> {
  const { count } = await getSupabaseAdmin()
    .from('mps_shop')
    .select('shop_id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('del_yn', 'N')
  return (count ?? 0) > 0
}

// ──────────────────────────────────────────────────────────────
// 구글 카페 GPS 자동인증 등록 — place_id 강제 매핑 + 현장 근접 검증
// ──────────────────────────────────────────────────────────────

// 이미 검증 등록된 place_id인지 확인 ("한 카페 = 한 주인" 사전 안내용)
// DB 부분 유니크 인덱스(uq_mps_shop_place_verified)가 최종 강제, 이건 친절한 사전 검사
export async function findVerifiedShopByPlaceId(placeId: string) {
  const { data } = await getSupabaseAdmin()
    .from('mps_shop')
    .select('shop_id, seller_id')
    .eq('place_id', placeId)
    .eq('owner_verified_yn', 'Y')
    .eq('del_yn', 'N')
    .maybeSingle()
  return (data as { shop_id: string; seller_id: string } | null) ?? null
}

export interface ClaimInput {
  place_id: string
  shop_nm: string
  addr: string // 필수 입력 (검증 안 함, 신고 항목)
  lat: number // 구글 place 좌표 (권위 기준, 매장 위치로 저장)
  lng: number
  contact_tel: string // 전화번호 — 구글과 대조 검증된 값
  owner_nm: string // 대표자명 — 필수 입력 (검증 안 함, 신고 항목)
  contact_email: string // 이메일 — 필수 입력 (검증 안 함, 신고 항목)
  biz_hour?: string | null
  // 구글 Place 정보 (모두 nullable) — 구글이 제공하는 모든 정보 보관
  google_nm?: string | null
  website_url?: string | null
  gmap_url?: string | null
  biz_status_cd?: string | null
  rating_cnt?: number | null
  google_place_json?: unknown
}

// 반자동 인증 통과 매장 생성 — owner_verified_yn='Y', verify_method_cd='MATCH'
// (place_id·전화번호는 구글 대조 검증, 대표자명·주소·이메일은 필수 신고 항목)
// place_id 중복 시 Postgres 23505 throw → 라우트에서 409로 변환
export async function createVerifiedShop(
  sellerId: string,
  regrId: string,
  input: ClaimInput,
) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .insert({
      seller_id: sellerId,
      shop_nm: input.shop_nm,
      shop_type_cd: 'OFFLINE', // 구글 카페는 실물 오프라인 매장
      addr: input.addr,
      latd_crd: input.lat,
      lngt_crd: input.lng,
      place_id: input.place_id,
      contact_tel: input.contact_tel,
      contact_email: input.contact_email,
      owner_nm: input.owner_nm,
      biz_hour: input.biz_hour ?? null,
      // 구글 Place 정보 보관
      google_nm: input.google_nm ?? null,
      website_url: input.website_url ?? null,
      gmap_url: input.gmap_url ?? null,
      biz_status_cd: input.biz_status_cd ?? null,
      rating_cnt: input.rating_cnt ?? null,
      google_place_json: input.google_place_json ?? null,
      owner_verified_yn: 'Y',
      verify_method_cd: 'MATCH',
      verify_dtm: new Date().toISOString(),
      regr_id: regrId,
      modr_id: regrId,
    })
    .select(SHOP_SELECT)
    .single()

  if (error) throw error // PostgrestError (code 23505 = place_id 중복)
  return data as unknown as MpsShop
}

// 논리삭제 — 소속 상품은 shop_id NULL 처리 (상품 자체 삭제 금지, FR-06)
export async function softDeleteShop(shopId: string, sellerId: string) {
  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { data } = await db
    .from('mps_shop')
    .update({ del_yn: 'Y', del_dtm: now, modr_id: sellerId, mod_dtm: now })
    .eq('shop_id', shopId)
    .eq('seller_id', sellerId)
    .eq('del_yn', 'N')
    .select('shop_id')

  if (!data || data.length === 0) return false

  await db
    .from('mps_item')
    .update({ shop_id: null, modr_id: sellerId, mod_dtm: now })
    .eq('shop_id', shopId)
  return true
}
