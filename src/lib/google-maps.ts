import 'server-only'

// Google Maps Geocoding API 서버 프록시 (Phase 15 LBS — TASK-134)
// 주소 ↔ 좌표 양방향 변환. Geocoding API 하나로 forward/reverse 모두 처리.
// API Key는 서버에서만 사용 (GOOGLE_MAPS_API_KEY) — 클라이언트 노출 금지 (PRD 섹션 10)

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

// 한국 행정구역 — 정밀 좌표 대신 행정구역 단위로 표시 (위치 프라이버시)
export interface GeoComponents {
  sido_nm: string | null // 시/도 (서울특별시, 경기도)
  sigungu_nm: string | null // 시/군/구 (수원시, 강남구)
  dong_nm: string | null // 동/읍/면 (매탄동)
}

export interface GeocodeResult {
  lat: number
  lng: number
  full_addr: string
  place_id: string | null
  components: GeoComponents
}

interface GoogleAddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface GoogleGeocodeItem {
  formatted_address: string
  place_id: string
  geometry: { location: { lat: number; lng: number } }
  address_components: GoogleAddressComponent[]
}

interface GoogleGeocodeResponse {
  status: string
  error_message?: string
  results: GoogleGeocodeItem[]
}

// types 우선순위 배열에서 가장 먼저 매칭되는 컴포넌트의 long_name 반환
function pickComponent(
  components: GoogleAddressComponent[],
  types: string[],
): string | null {
  for (const t of types) {
    const c = components.find((comp) => comp.types.includes(t))
    if (c) return c.long_name
  }
  return null
}

// 한국 주소 컴포넌트 → 행정구역 3단계 파싱.
// Google의 한국 주소 매핑은 지역별로 type이 달라 우선순위 fallback이 필요하다.
// - 시도: administrative_area_level_1
// - 시군구: administrative_area_level_2 우선 → locality 폴백(광역시 자치구 등)
// - 동읍면: sublocality_level_2 → sublocality_level_1 → sublocality 순 폴백
function parseKoreanRegion(
  components: GoogleAddressComponent[],
): GeoComponents {
  return {
    sido_nm: pickComponent(components, ['administrative_area_level_1']),
    sigungu_nm: pickComponent(components, [
      'administrative_area_level_2',
      'locality',
    ]),
    dong_nm: pickComponent(components, [
      'sublocality_level_2',
      'sublocality_level_1',
      'sublocality',
    ]),
  }
}

// Geocoding API 호출 결과를 표준 형태로 정규화.
// status별 처리: OK → 결과, ZERO_RESULTS → null(에러 아님), 그 외 → throw
async function callGeocode(
  params: Record<string, string>,
): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY 미설정')

  const sp = new URLSearchParams({ ...params, key, language: 'ko' })
  const res = await fetch(`${GEOCODE_URL}?${sp}`, {
    // 동일 좌표/주소 반복 변환 방지 — Next.js fetch 캐시 1일(비용 절감)
    next: { revalidate: 86400 },
  })

  if (!res.ok) {
    throw new Error(`Geocoding API HTTP ${res.status}`)
  }

  const data = (await res.json()) as GoogleGeocodeResponse

  if (data.status === 'ZERO_RESULTS') return null
  if (data.status !== 'OK') {
    // REQUEST_DENIED(API 미사용설정/결제 미연결), OVER_QUERY_LIMIT 등
    throw new Error(
      `Geocoding API ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`,
    )
  }

  const item = data.results[0]
  return {
    lat: item.geometry.location.lat,
    lng: item.geometry.location.lng,
    full_addr: item.formatted_address,
    place_id: item.place_id ?? null,
    components: parseKoreanRegion(item.address_components),
  }
}

// 주소 → 좌표 (forward geocoding) — 가입 위치 수동 입력 등
export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  return callGeocode({ address })
}

// 좌표 → 주소 + 행정구역 (reverse geocoding) — GPS 좌표를 사람이 읽는 주소로.
// 좌표를 소수점 4자리(~11m)로 반올림해 호출 — 행정구역(시군구/동) 해상도에는 영향 없고,
// 미세하게 흔들리는 GPS 좌표의 fetch 캐시(1일) 적중률을 크게 높여 API 비용을 절감한다.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
  const rLat = Math.round(lat * 1e4) / 1e4
  const rLng = Math.round(lng * 1e4) / 1e4
  return callGeocode({ latlng: `${rLat},${rLng}` })
}

// ──────────────────────────────────────────────────────────────
// Place Details (New) — 매장 소유권 반자동 인증의 권위 기준값 조회
// 서버가 place_id로 구글에 직접 조회해 전화번호·좌표를 받아 입력값과 대조한다.
// (클라이언트가 보낸 "구글 데이터"는 위조 가능하므로 반드시 서버에서 재조회)
// ──────────────────────────────────────────────────────────────
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places'

export interface PlaceDetails {
  place_id: string
  name: string | null
  formatted_addr: string | null
  national_phone: string | null
  international_phone: string | null
  lat: number | null
  lng: number | null
}

interface GooglePlaceResponse {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  location?: { latitude?: number; longitude?: number }
}

// place_id로 Place Details (New) 조회. 존재하지 않으면 null, API 오류는 throw.
export async function getPlaceDetails(
  placeId: string,
): Promise<PlaceDetails | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY 미설정')

  const fields = [
    'id',
    'displayName',
    'formattedAddress',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'location',
  ].join(',')

  const res = await fetch(
    `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=ko`,
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fields,
      },
      // 매장 정보는 자주 안 바뀜 — 1일 캐시(검증 비용 절감)
      next: { revalidate: 86400 },
    },
  )

  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Place Details API HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const d = (await res.json()) as GooglePlaceResponse
  return {
    place_id: d.id ?? placeId,
    name: d.displayName?.text ?? null,
    formatted_addr: d.formattedAddress ?? null,
    national_phone: d.nationalPhoneNumber ?? null,
    international_phone: d.internationalPhoneNumber ?? null,
    lat: d.location?.latitude ?? null,
    lng: d.location?.longitude ?? null,
  }
}

// 전화번호 정규화 — 숫자만 추출해 형식 차이(공백·하이픈·국가코드) 흡수 후 비교용.
// 국가코드 흡수: 국제번호(+82 10...)와 국내번호(010...)를 끝 9자리로 느슨히 비교.
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

// 두 전화번호가 같은지 — 정규화 후 한쪽이 다른 쪽의 끝부분을 포함하면 일치로 본다
// (국내 010-1234-5678 ↔ 국제 +82 10-1234-5678 동일 처리, 마지막 9자리 기준)
export function phoneMatches(a: string, b: string): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const tailA = na.slice(-9)
  const tailB = nb.slice(-9)
  return tailA.length === 9 && tailA === tailB
}
