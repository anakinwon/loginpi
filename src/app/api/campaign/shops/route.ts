import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export interface ShopConditionRow {
  shop_id: string
  shop_nm: string
  seller_id: string
  pi_username: string | null
  conditions: { shop: true; item: boolean; telegram: boolean }
  grant_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  reg_dtm: string
}

// GET /api/campaign/shops
// 관리자: 전체 매장 조건 현황, 일반: 본인 매장만
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
    .order('reg_dtm', {
    ascending: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!shops?.length) return NextResponse.json({ shops: [], is_admin: admin })

  const sellerIds = [...new Set(shops.map((s) => s.seller_id))]

  // FK 없음 → 별도 조회 후 Map 병합 (getEventRanking 패턴)
  const [usersRes, itemsRes, grantsRes] = await Promise.all([
    db
      .from('sys_user')
      .select('id, pi_username, nick_nm, tlgm_conn_yn')
      .in('id', sellerIds),
    db
      .from('mps_item')
      .select('seller_id')
      .eq('del_yn', 'N')
      .in('seller_id', sellerIds),
    db
      .from('bean_campaign_grant')
      .select('usr_id, grant_st_cd')
      .eq('campaign_cd', 'SHOP_ONBOARD')
      .eq('del_yn', 'N')
      .in('usr_id', sellerIds),
  ])

  const userMap = new Map(
    (usersRes.data ?? []).map((u) => [
      u.id,
      u as { id: string; pi_username: string | null; nick_nm: string | null; tlgm_conn_yn: string | null },
    ]),
  )
  const itemSellerSet = new Set((itemsRes.data ?? []).map((i) => i.seller_id))
  const grantMap = new Map(
    (grantsRes.data ?? []).map((g) => [g.usr_id, g.grant_st_cd as ShopConditionRow['grant_status']]),
  )

  const rows: ShopConditionRow[] = shops.map((s) => {
    const u = userMap.get(s.seller_id)
    return {
      shop_id: s.shop_id,
      shop_nm: s.shop_nm,
      seller_id: s.seller_id,
      pi_username: u?.pi_username ?? u?.nick_nm ?? null,
      conditions: {
        shop: true,
        item: itemSellerSet.has(s.seller_id),
        telegram: u?.tlgm_conn_yn === 'Y',
      },
      grant_status: grantMap.get(s.seller_id) ?? null,
      reg_dtm: s.reg_dtm,
    }
  })

  // 완료 조건 수 내림차순 → 등록일 오름차순
  rows.sort((a, b) => {
    const ca = Object.values(a.conditions).filter(Boolean).length
    const cb = Object.values(b.conditions).filter(Boolean).length
    return cb - ca || a.reg_dtm.localeCompare(b.reg_dtm)
  })

  return NextResponse.json({ shops: rows, is_admin: admin, my_seller_id: user.id })
}
