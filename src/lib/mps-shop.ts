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
}

export async function listMyShops(sellerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .select(SHOP_SELECT)
    .eq('seller_id', sellerId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

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

export interface GpsClaimInput {
  place_id: string
  shop_nm: string
  addr?: string | null
  lat: number // 구글 place 좌표 (매장 위치로 저장)
  lng: number
  biz_hour?: string | null
  contact_tel?: string | null
}

// GPS 현장 검증 통과 매장 생성 — owner_verified_yn='Y', verify_method_cd='GPS'
// place_id 중복 시 Postgres 23505 throw → 라우트에서 409로 변환
export async function createGpsVerifiedShop(
  sellerId: string,
  regrId: string,
  input: GpsClaimInput,
) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .insert({
      seller_id: sellerId,
      shop_nm: input.shop_nm,
      shop_type_cd: 'OFFLINE', // 구글 카페는 실물 오프라인 매장
      addr: input.addr ?? null,
      latd_crd: input.lat,
      lngt_crd: input.lng,
      place_id: input.place_id,
      biz_hour: input.biz_hour ?? null,
      contact_tel: input.contact_tel ?? null,
      owner_verified_yn: 'Y',
      verify_method_cd: 'GPS',
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
