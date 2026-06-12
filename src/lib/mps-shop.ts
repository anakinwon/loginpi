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
