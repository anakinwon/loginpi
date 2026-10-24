import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

// GET /api/location/nearby/shops?lat=&lng=&radius= — 주변 MPS 매장 탐색 (Rule LBS-01)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  if (user.lbs_consent_yn !== 'Y') {
    return apiError('LOC_CONSENT_REQUIRED', 403)
  }

  const sp = request.nextUrl.searchParams
  const lat = parseFloat(sp.get('lat') ?? '')
  const lng = parseFloat(sp.get('lng') ?? '')
  // 반경(km) 0.1~500 — 숫자가 아니면 기본 10(위경도 상자 계산이 NaN 이 되지 않게, R-P5)
  const radius = Math.min(
    500,
    Math.max(0.1, parseFloat(sp.get('radius') ?? '10') || 10),
  )

  if (
    isNaN(lat) ||
    isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return apiError('LOC_LATLNG_WGS84_REQUIRED', 400)
  }

  // 반경을 감싸는 위경도 상자로 DB 에서 먼저 거름 — 좌표 있는 매장 전량을 받아 메모리에서 거르던 것 대체(R-P3, 2026-10-24 전수 점검)
  //  위도 1° ≈ 111km, 경도 1° ≈ 111km × cos(위도). 날짜변경선·극지방에 걸리면 경도 조건은 생략(정확한 거리 판정은 아래 그대로)
  const dLat = radius / 111
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dLng = cosLat > 0.01 ? radius / (111 * cosLat) : 360
  let q = getSupabaseAdmin()
    .from('mps_shop')
    .select(
      'shop_id, shop_nm, shop_type_cd, addr, contact_tel, biz_hour, lat:latd_crd, lng:lngt_crd, place_id, owner_verified_yn',
    )
    .eq('del_yn', 'N')
    .gte('latd_crd', lat - dLat)
    .lte('latd_crd', lat + dLat)
  if (lng - dLng >= -180 && lng + dLng <= 180)
    q = q.gte('lngt_crd', lng - dLng).lte('lngt_crd', lng + dLng)
  const { data, error } = await q.not('lngt_crd', 'is', null)

  if (error)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/location/nearby/shops/get',
          error,
          '주변 매장 조회 중 오류가 발생했습니다',
        ),
      },
      { status: 500 },
    )

  type ShopRow = {
    shop_id: string
    shop_nm: string
    shop_type_cd: string | null
    addr: string | null
    contact_tel: string | null
    biz_hour: string | null
    lat: number
    lng: number
    place_id: string | null
    owner_verified_yn: string | null
  }

  const shops = (data as ShopRow[])
    .map((s) => {
      const dLat = ((s.lat - lat) * Math.PI) / 180
      const dLon = ((s.lng - lng) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((s.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2
      const distance_km =
        Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) /
        10
      return { ...s, distance_km }
    })
    .filter((s) => s.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km)

  // 각 매장의 판매중(OPEN) 상품을 한 번에 묶어 조회 → InfoWindow에서 영업시간 대신 표시·거래
  type ItemMini = {
    item_id: string
    item_nm: string
    price_pi: number | string
    shop_id: string
    thumbnail_url: string | null
  }
  const shopIds = shops.map((s) => s.shop_id)
  const itemsByShop: Record<string, ItemMini[]> = {}
  if (shopIds.length > 0) {
    const { data: items } = await getSupabaseAdmin()
      .from('mps_item')
      .select('item_id, item_nm, price_pi, shop_id, thumbnail_url')
      .in('shop_id', shopIds)
      .eq('item_st_cd', 'OPEN')
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
    for (const it of (items as ItemMini[] | null) ?? []) {
      ;(itemsByShop[it.shop_id] ??= []).push(it)
    }
  }

  const shopsWithItems = shops.map((s) => ({
    ...s,
    items: (itemsByShop[s.shop_id] ?? []).slice(0, 10), // 매장당 최대 10개
  }))

  return NextResponse.json({
    shops: shopsWithItems,
    total: shopsWithItems.length,
  })
}
