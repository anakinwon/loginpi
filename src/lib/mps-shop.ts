import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// MPS 판매자 매장 CRUD — lat/lng/place_id는 Google Maps Phase 3 확장 포인트

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
    .select('*')
    .eq('seller_id', sellerId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as MpsShop[]
}

export async function createShop(sellerId: string, regrId: string, input: ShopInput) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .insert({ ...input, seller_id: sellerId, regr_id: regrId, modr_id: regrId })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as MpsShop
}

export async function updateShop(shopId: string, sellerId: string, patch: Partial<ShopInput>) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .update({ ...patch, modr_id: sellerId, mod_dtm: new Date().toISOString() })
    .eq('shop_id', shopId)
    .eq('seller_id', sellerId) // 본인 매장만
    .eq('del_yn', 'N')
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as MpsShop | null) ?? null
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
