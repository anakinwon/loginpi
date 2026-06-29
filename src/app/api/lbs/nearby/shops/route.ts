import { NextRequest, NextResponse } from 'next/server'
import { publicCacheHeaders } from '@/lib/cache-headers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/lbs/nearby/shops?lat=37.5&lng=127.0&radius_m=5000&page=1&limit=20
// 위치 기반 상점 목록 조회 (페이지네이션)
//
// 입력:
//   lat: 위도 (required)
//   lng: 경도 (required)
//   radius_m: 반경 미터 (기본: 5000)
//   page: 페이지번호 1부터 (기본: 1)
//   limit: 페이지당 아이템 수 (기본: 20, 최대: 100)
//
// 응답:
//   shops: 페이지네이션된 상점 목록
//   total: 전체 상점 개수
//   page: 현재 페이지
//   limit: 페이지당 항목 수
//   total_pages: 전체 페이지 수
//
// 캐싱: publicCacheHeaders(1800) — 공개 좌표만이라 공유 캐시 안전
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  const radius_m = Math.max(100, Number(searchParams.get('radius_m') ?? '5000'))
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(
    Math.max(1, Number(searchParams.get('limit') ?? '20')),
    100,
  )

  // 입력값 검증
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(
      { error: 'lat, lng는 필수 숫자 필드입니다' },
      { status: 400 },
    )
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: '좌표 범위를 벗어났습니다' },
      { status: 400 },
    )
  }

  try {
    const db = getSupabaseAdmin()

    // 1단계: 거리 기반 필터링 + 활성 상점만 (del_yn='N')
    // PostGIS ST_DWithin 또는 거리 공식 사용
    // 대각선 근사 거리: √((lat_diff * 111km)² + (lng_diff * 111km * cos(lat))²)
    // 간단한 근사: |lat_diff| * 111km + |lng_diff| * 111km * cos(lat)
    //
    // Supabase PostGREST는 ST_DWithin 직접 지원하지만,
    // SELECT에서 필터링만 가능(거리값 반환 X). 따라서 거리 계산을 WHERE에만 사용.

    const earthRadiusKm = 6371
    const latRad = (lat * Math.PI) / 180
    const cosLat = Math.cos(latRad)

    // 거리 계산 보조: 좌표 차이로 대략 거리 추정 (km)
    // 정밀도: 위도 1도 = 111km, 경도 1도 = 111km * cos(latitude)
    // 우리는 단순 근사만 필요 → Supabase의 ST_Distance_Sphere 또는 거리 공식
    // 현재 mps_shop.latd_crd / lngt_crd 컬럼 존재 확인 필요
    //
    // Supabase PostGREST는 distance 함수 미지원이라
    // 거리 기반 필터링은 Client-side 또는 RPC로 처리
    // 여기선 대각선 거리 근사: distance_km ≈ √((lat_diff*111)² + (lng_diff*111*cos(lat))²)
    //
    // 하지만 PostGREST에서 직접 거리 계산 후 정렬은 어려우므로
    // 전체 상점 조회 후 Client-side 거리 정렬은 성능 저하
    //
    // 최선의 방법: RPC(SQL 함수) 또는 대각 박스 필터 먼저 후 Client-side 정렬
    // 여기선 대각 박스로 대략 필터 → 후처리:
    // latd_crd BETWEEN lat - radius/111 AND lat + radius/111
    // lngt_crd BETWEEN lng - radius/(111*cos(lat)) AND lng + radius/(111*cos(lat))

    const latRadius = radius_m / 1000 / 111 // km -> degree
    const lngRadius = radius_m / 1000 / (111 * cosLat)

    const latMin = lat - latRadius
    const latMax = lat + latRadius
    const lngMin = lng - lngRadius
    const lngMax = lng + lngRadius

    // 2단계: 전체 개수 조회 (페이지네이션 위해)
    const { count: totalCount } = await db
      .from('mps_shop')
      .select('*', { count: 'exact', head: true })
      .eq('del_yn', 'N')
      .gte('latd_crd', latMin)
      .lte('latd_crd', latMax)
      .gte('lngt_crd', lngMin)
      .lte('lngt_crd', lngMax)

    const total = totalCount ?? 0
    const totalPages = Math.max(1, Math.ceil(total / limit))

    // 페이지 범위 검증 (범위 초과 시 마지막 페이지로)
    const actualPage = Math.min(page, totalPages)
    const offset = (actualPage - 1) * limit

    // 3단계: 페이지네이션 조회
    const { data: shops, error } = await db
      .from('mps_shop')
      .select(
        `
        id,
        shop_nm,
        shop_desc,
        latd_crd,
        lngt_crd,
        addr_std,
        addr_dtl,
        tel_no,
        web_url,
        biz_img_url
      `,
      )
      .eq('del_yn', 'N')
      .gte('latd_crd', latMin)
      .lte('latd_crd', latMax)
      .gte('lngt_crd', lngMin)
      .lte('lngt_crd', lngMax)
      .order('latd_crd', { ascending: true }) // 기본 정렬 (거리순 정렬은 후처리)
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`상점 조회 실패: ${error.message}`)
    }

    // 4단계: Client-side 거리 계산 및 정렬
    // 하버사인 공식 (정밀) 또는 대각선 근사 (빠름)
    const calcDistance = (
      lat1: number,
      lng1: number,
      lat2: number,
      lng2: number,
    ): number => {
      const dLat = ((lat2 - lat1) * Math.PI) / 180
      const dLng = ((lng2 - lng1) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return earthRadiusKm * c * 1000 // 미터 단위
    }

    const shopsWithDistance = (shops ?? [])
      .map((shop) => ({
        ...shop,
        distance_m: Math.round(
          calcDistance(lat, lng, shop.latd_crd, shop.lngt_crd),
        ),
      }))
      .filter((shop) => shop.distance_m <= radius_m) // 최종 거리 필터링
      .sort((a, b) => a.distance_m - b.distance_m) // 거리 가까운 순 정렬

    return NextResponse.json(
      {
        shops: shopsWithDistance,
        total,
        page: actualPage,
        limit,
        total_pages: totalPages,
      },
      { headers: publicCacheHeaders(1800) }, // 30분 캐싱
    )
  } catch (err) {
    console.error('[lbs/nearby/shops] 조회 실패:', err)
    return NextResponse.json({ error: '상점 조회 실패' }, { status: 500 })
  }
}
