import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export interface ShopConditionRow {
  shop_id: string        // 대표 매장 ID
  shop_nm: string        // 대표 매장명
  seller_id: string
  pi_username: string | null
  shop_count: number     // 판매자가 보유한 총 매장 수
  conditions: { shop: true; item: boolean; telegram: boolean; tlgm_alrt: boolean }
  grant_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  reg_dtm: string        // 판매자의 첫 매장 등록일
}

// GET /api/campaign/shops
// 판매자(seller_id) 기준 1행 — 대표 매장 = sys_user.rep_shop_id 우선, 없으면 첫 등록 매장
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()
  const admin = isAdmin(user)

  const { data: shops, error } = await db
    .from('mps_shop')
    .select('shop_id, shop_nm, seller_id, reg_dtm')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true }) // 첫 등록 매장이 앞에 오도록

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!shops?.length)
    return NextResponse.json({ shops: [], is_admin: admin, my_seller_id: user.id })

  // seller_id 기준 그룹핑 (shops는 reg_dtm ASC 정렬이므로 list[0] = 최초 등록 매장)
  const sellerShopsMap = new Map<string, typeof shops>()
  for (const s of shops) {
    const list = sellerShopsMap.get(s.seller_id) ?? []
    list.push(s)
    sellerShopsMap.set(s.seller_id, list)
  }

  const sellerIds = [...sellerShopsMap.keys()]

  // ── 쿼리 분리: 기존 안정 컬럼 vs 신규 컬럼(SQL 099·100) ──────────────────────
  // PostgREST는 select 목록에 없는 컬럼이 하나라도 있으면 쿼리 전체를 에러로 반환.
  // 마이그레이션 적용 전후 모두 안전하게 동작하도록 별도 쿼리 + 에러 무시 패턴 사용.
  const [usersRes, usersExtRes, itemsRes, grantsRes] = await Promise.all([
    // 기존 컬럼 — 항상 존재
    db
      .from('sys_user')
      .select('id, pi_username, nick_nm, tlgm_conn_yn')
      .in('id', sellerIds),
    // 신규 컬럼 (SQL 099·100) — 미적용 시 에러 무시
    db
      .from('sys_user')
      .select('id, tlgm_alrt_cfm_yn, rep_shop_id')
      .in('id', sellerIds),
    db
      .from('mps_item')
      .select('seller_id')
      .eq('del_yn', 'N')
      .in('seller_id', sellerIds),
    db
      .from('bean_campaign_grant')
      .select('usr_id, grant_st_cd, shop_id')
      .eq('campaign_cd', 'SHOP_ONBOARD')
      .eq('del_yn', 'N')
      .in('usr_id', sellerIds),
  ])

  type BaseUser = { id: string; pi_username: string | null; nick_nm: string | null; tlgm_conn_yn: string | null }
  type ExtUser  = { id: string; tlgm_alrt_cfm_yn: string | null; rep_shop_id: string | null }

  const userMap = new Map<string, BaseUser>(
    (usersRes.data ?? []).map((u) => [u.id, u as BaseUser]),
  )
  // 신규 컬럼 에러 시 extMap 빈 Map — 기능 저하 없이 폴백
  const extMap = new Map<string, ExtUser>(
    (!usersExtRes.error ? (usersExtRes.data ?? []) : []).map((u) => [
      (u as ExtUser).id,
      u as ExtUser,
    ]),
  )
  const itemSellerSet = new Set((itemsRes.data ?? []).map((i) => i.seller_id))
  const grantMap = new Map(
    (grantsRes.data ?? []).map((g) => [
      g.usr_id,
      {
        grant_st_cd: g.grant_st_cd as ShopConditionRow['grant_status'],
        shop_id: g.shop_id as string | null,
      },
    ]),
  )

  const rows: ShopConditionRow[] = []
  for (const [sellerId, sellerShops] of sellerShopsMap) {
    const u   = userMap.get(sellerId)
    const ext = extMap.get(sellerId)
    const grant = grantMap.get(sellerId)

    // 대표 매장 우선순위: sys_user.rep_shop_id > grant.shop_id > 첫 등록 매장
    const repShopId = ext?.rep_shop_id ?? grant?.shop_id ?? null
    const repShop   = repShopId
      ? (sellerShops.find((s) => s.shop_id === repShopId) ?? sellerShops[0])
      : sellerShops[0]

    rows.push({
      shop_id:    repShop.shop_id,
      shop_nm:    repShop.shop_nm,
      seller_id:  sellerId,
      pi_username: u?.pi_username ?? u?.nick_nm ?? null,
      shop_count:  sellerShops.length,
      conditions: {
        shop:      true,
        item:      itemSellerSet.has(sellerId),
        telegram:  u?.tlgm_conn_yn === 'Y',
        tlgm_alrt: ext?.tlgm_alrt_cfm_yn === 'Y',
      },
      grant_status: grant?.grant_st_cd ?? null,
      reg_dtm:      sellerShops[0].reg_dtm,
    })
  }

  // 완료 조건 수 내림차순 → 첫 매장 등록일 오름차순
  rows.sort((a, b) => {
    const ca = Object.values(a.conditions).filter(Boolean).length
    const cb = Object.values(b.conditions).filter(Boolean).length
    return cb - ca || a.reg_dtm.localeCompare(b.reg_dtm)
  })

  return NextResponse.json({ shops: rows, is_admin: admin, my_seller_id: user.id })
}
