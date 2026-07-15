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
  // 확장 필드 — 구글이 제공하는 모든 정보 (mps_shop 보관용)
  website_uri: string | null
  google_maps_uri: string | null
  business_status: string | null
  rating: number | null
  user_rating_count: number | null
  biz_hours: string | null // regularOpeningHours.weekdayDescriptions 줄바꿈 결합
  primary_type: string | null
  raw: GooglePlaceResponse // 전체 원본 (google_place_json 저장용)
}

interface GooglePlaceResponse {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  shortFormattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  location?: { latitude?: number; longitude?: number }
  websiteUri?: string
  googleMapsUri?: string
  businessStatus?: string
  rating?: number
  userRatingCount?: number
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  primaryType?: string
  primaryTypeDisplayName?: { text?: string }
  types?: string[]
  priceLevel?: string
  plusCode?: { globalCode?: string; compoundCode?: string }
  utcOffsetMinutes?: number
  [key: string]: unknown
}

// Place Details (New) 필드 마스크 — 구글이 제공하는 주요 정보 일괄 요청.
// 주의: 필드가 많을수록 상위 과금 SKU(Preferred). 등록 1회·1일 캐시라 비용 영향 작음.
const PLACE_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'location',
  'websiteUri',
  'googleMapsUri',
  'businessStatus',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'priceLevel',
  'plusCode',
  'utcOffsetMinutes',
].join(',')

// place_id로 Place Details (New) 조회. 존재하지 않으면 null, API 오류는 throw.
export async function getPlaceDetails(
  placeId: string,
): Promise<PlaceDetails | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY 미설정')

  const res = await fetch(
    `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=ko`,
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': PLACE_FIELD_MASK,
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
    website_uri: d.websiteUri ?? null,
    google_maps_uri: d.googleMapsUri ?? null,
    business_status: d.businessStatus ?? null,
    rating: d.rating ?? null,
    user_rating_count: d.userRatingCount ?? null,
    biz_hours: d.regularOpeningHours?.weekdayDescriptions?.join('\n') ?? null,
    primary_type: d.primaryTypeDisplayName?.text ?? d.primaryType ?? null,
    raw: d,
  }
}

// ──────────────────────────────────────────────────────────────
// Place Reviews (New) — 매장 상세 화면의 구글 평점·리뷰 표시용
// 평점(rating)·총개수(userRatingCount)는 전체 리뷰 기준 집계값,
// 리뷰 본문(reviews)은 구글 정책상 최대 5개만 제공된다.
// ⚠️ 구글 약관: 리뷰 데이터 영구 저장(DB 캐싱) 금지 → 라이브 조회 + 단기 fetch 캐시만
// ──────────────────────────────────────────────────────────────
export interface PlaceReview {
  author_nm: string | null
  author_photo_url: string | null
  rating: number | null
  text: string | null
  relative_time: string | null // "1개월 전" 등 구글 제공 상대시간 (languageCode 반영)
  publish_dtm: string | null
}

export interface PlaceReviews {
  rating: number | null // 전체 리뷰 기준 평균 (소수점 1자리)
  user_rating_count: number | null // 전체 리뷰 개수
  google_maps_uri: string | null // 전체 리뷰는 구글 지도로 유도 (API는 5개 제한)
  reviews: PlaceReview[]
}

interface GoogleReviewItem {
  rating?: number
  text?: { text?: string }
  originalText?: { text?: string }
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string }
  relativePublishTimeDescription?: string
  publishTime?: string
}

// 리뷰 전용 최소 필드 마스크 — getPlaceDetails(등록 검증용)와 분리해 과금 SKU를 낮게 유지
const REVIEWS_FIELD_MASK = 'rating,userRatingCount,googleMapsUri,reviews'

// place_id로 구글 평점·리뷰(최대 5개) 조회. 장소 없으면 null, API 오류는 throw.
// languageCode: 뷰어 locale의 언어 부분 (예: 'ko', 'en') — 리뷰 번역·상대시간 표기에 반영
export async function getPlaceReviews(
  placeId: string,
  languageCode = 'ko',
): Promise<PlaceReviews | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY 미설정')

  const res = await fetch(
    `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`,
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': REVIEWS_FIELD_MASK,
      },
      // 약관상 영구 저장 불가 — 1시간 단기 캐시로 비용만 절감 (URL에 languageCode 포함 → 언어별 캐시)
      next: { revalidate: 3600 },
    },
  )

  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Place Reviews API HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }

  const d = (await res.json()) as GooglePlaceResponse & {
    reviews?: GoogleReviewItem[]
  }
  return {
    rating: d.rating ?? null,
    user_rating_count: d.userRatingCount ?? null,
    google_maps_uri: d.googleMapsUri ?? null,
    reviews: (d.reviews ?? []).map((r) => ({
      author_nm: r.authorAttribution?.displayName ?? null,
      author_photo_url: r.authorAttribution?.photoUri ?? null,
      rating: r.rating ?? null,
      text: r.text?.text ?? r.originalText?.text ?? null,
      relative_time: r.relativePublishTimeDescription ?? null,
      publish_dtm: r.publishTime ?? null,
    })),
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
