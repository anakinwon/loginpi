// 지도 앱 네비게이션 딥링크 빌더
// 우선순위: place_id > 좌표(lat/lng) > 주소 텍스트
// Pi Browser는 외부 앱 실행을 window.open으로 위임 — 네이티브 지도 앱이 실제 네비게이션 처리

export interface ShopLocation {
  place_id?: string | null
  latd_crd?: number | null
  lngt_crd?: number | null
  addr?: string | null
  shop_nm?: string | null
}

/**
 * Google Maps 딥링크 — 가장 정확한 destination을 자동 선택
 * - place_id: 매장 PIN 정확 일치 (구글 장소 ID)
 * - 좌표: place_id 없을 때 위경도로 직접 지정
 * - 주소: 좌표도 없을 때 텍스트 검색으로 폴백
 */
export function buildGoogleMapsUrl(loc: ShopLocation): string | null {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving'

  if (loc.place_id) {
    return `${base}&destination_place_id=${encodeURIComponent(loc.place_id)}`
  }
  if (loc.latd_crd != null && loc.lngt_crd != null) {
    return `${base}&destination=${loc.latd_crd},${loc.lngt_crd}`
  }
  if (loc.addr) {
    return `${base}&destination=${encodeURIComponent(loc.addr)}`
  }
  return null
}

/**
 * 카카오맵 딥링크 — 한국 사용자 대안
 * place_id가 없으면 좌표 또는 주소로 검색
 */
export function buildKakaoMapUrl(loc: ShopLocation): string | null {
  const name = encodeURIComponent(loc.shop_nm ?? '매장')

  if (loc.latd_crd != null && loc.lngt_crd != null) {
    return `kakaomap://look?p=${loc.latd_crd},${loc.lngt_crd}`
  }
  if (loc.addr) {
    return `kakaomap://search?q=${encodeURIComponent(loc.addr)}&name=${name}`
  }
  return null
}

/**
 * 네이버 지도 딥링크 — 한국 사용자 대안
 */
export function buildNaverMapUrl(loc: ShopLocation): string | null {
  const name = encodeURIComponent(loc.shop_nm ?? '매장')

  if (loc.latd_crd != null && loc.lngt_crd != null) {
    return `nmap://navigation?dlat=${loc.latd_crd}&dlng=${loc.lngt_crd}&dname=${name}&appname=cafe.pi`
  }
  if (loc.addr) {
    return `nmap://search?query=${encodeURIComponent(loc.addr)}&appname=cafe.pi`
  }
  return null
}
