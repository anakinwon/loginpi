import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/location/nearby/shops?lat=&lng=&radius= — 주변 MPS 매장 탐색 (Rule LBS-01)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  if (user.lbs_consent_yn !== 'Y') {
    return NextResponse.json(
      { error: '위치기반서비스 이용약관에 동의하지 않으셨습니다' },
      { status: 403 },
    )
  }

  const sp = request.nextUrl.searchParams
  const lat = parseFloat(sp.get('lat') ?? '')
  const lng = parseFloat(sp.get('lng') ?? '')
  const radius = parseFloat(sp.get('radius') ?? '10')

  if (
    isNaN(lat) ||
    isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: 'lat, lng는 필수 유효한 WGS84 좌표입니다' },
      { status: 400 },
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop')
    .select(
      'shop_id, shop_nm, shop_type_cd, addr, contact_tel, biz_hour, lat:latd_crd, lng:lngt_crd, place_id, owner_verified_yn',
    )
    .eq('del_yn', 'N')
    .not('latd_crd', 'is', null)
    .not('lngt_crd', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  return NextResponse.json({ shops, total: shops.length })
}
