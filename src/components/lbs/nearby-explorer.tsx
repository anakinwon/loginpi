'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useThemeName } from '@/components/chat/use-theme-name'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { piFetch } from '@/lib/pi-fetch'
import { getCurrentPosition } from '@/lib/geo'
import { LbsConsentDialog } from '@/components/lbs/lbs-consent-dialog'
import { ShopsMapView } from '@/components/lbs/shops-map-view'
import { LazySection } from '@/components/lazy-section'

// 주변 탐색 — 동의자에게만 GPS 기준 주변 매장·채팅방 노출 (Rule LBS-01)
// nearby/shops·nearby/rooms API를 보여주는 화면. Pi Browser 클라이언트 게이트 패턴.

interface NearbyShopItem {
  item_id: string
  item_nm: string
  price_pi: number | string
  thumbnail_url: string | null
}

interface NearbyShop {
  shop_id: string
  shop_nm: string
  shop_type_cd: string | null
  addr: string | null
  biz_hour: string | null
  distance_km: number
  lat: number
  lng: number
  owner_verified_yn?: string | null
  items?: NearbyShopItem[]
}

interface NearbyRoom {
  room_id: string
  room_nm: string
  room_desc: string | null
  theme_cd: string
  theme_emoji: string
  theme_nm: string
  sigungu_nm: string | null
  distance_km: number
}

type Tab = 'shops' | 'rooms'
type ShopsViewMode = 'list' | 'map'
// Google Places API (New) Table A 'Food and Drink' 공식 타입 기준 (1:1 매핑, 요리별 세분 타입 제외)
// https://developers.google.com/maps/documentation/places/web-service/place-types
export type BizCategory =
  | 'ALL' // Pi 등록 매장 (Google 타입 아님)
  | 'CAFE' // cafe
  | 'COFFEE_SHOP' // coffee_shop
  | 'TEA_HOUSE' // tea_house
  | 'BAKERY' // bakery
  | 'DESSERT_SHOP' // dessert_shop
  | 'ICE_CREAM_SHOP' // ice_cream_shop
  | 'RESTAURANT' // restaurant
  | 'FAST_FOOD' // fast_food_restaurant
  | 'MEAL_TAKEAWAY' // meal_takeaway
  | 'BAR' // bar
  | 'PUB' // pub
  | 'WINE_BAR' // wine_bar
const RADIUS_OPTIONS = [1, 5, 10] as const

// 표시 라벨은 i18n lbs.bizCatOption.* — 렌더에서 t()로 처리
const BIZ_CATEGORIES: BizCategory[] = [
  'ALL',
  'CAFE',
  'COFFEE_SHOP',
  'TEA_HOUSE',
  'BAKERY',
  'DESSERT_SHOP',
  'ICE_CREAM_SHOP',
  'RESTAURANT',
  'FAST_FOOD',
  'MEAL_TAKEAWAY',
  'BAR',
  'PUB',
  'WINE_BAR',
]

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

// 두 좌표 간 거리(km) — Haversine. 실시간 추적 시 '의미 있는 이동'(임계 거리) 판정용
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 이 거리(km) 이상 이동했을 때만 재조회 → watchPosition 콜백 폭주로 인한 과도한 API 호출 방지
const LIVE_MOVE_THRESHOLD_KM = 0.03 // 30m

// ── P1 선표시(당근 패턴): 마지막 위치·동의를 캐시해 GPS/동의 API 대기를 체감에서 제거 ──
//   위치: 캐시 좌표로 즉시 지도+목록 표시 → GPS 도착 시 30m 이상 차이면 조용히 보정.
//   동의: 이전 동의자는 낙관 표시로 즉시 진행 — 정본은 서버(데이터 API가 미동의 403 재검증, Rule LBS-01 유지).
const LAST_POS_KEY = 'lbs_last_pos' // { lat, lng, ts }
const CONSENT_CACHE_KEY = 'lbs_consent_y' // '1' = 직전 세션에서 동의 확인됨
const LAST_POS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7일

function readLastPos(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(LAST_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { lat: number; lng: number; ts: number }
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number')
      return null
    if (Date.now() - (p.ts ?? 0) > LAST_POS_TTL_MS) return null
    return { lat: p.lat, lng: p.lng }
  } catch {
    return null
  }
}

function writeLastPos(pos: { lat: number; lng: number }) {
  try {
    localStorage.setItem(
      LAST_POS_KEY,
      JSON.stringify({ ...pos, ts: Date.now() }),
    )
  } catch {}
}

export function NearbyExplorer() {
  const t = useTranslations('lbs')
  const themeName = useThemeName()
  const [lbsConsent, setLbsConsent] = useState<'Y' | 'N' | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [locError, setLocError] = useState<string | null>(null)
  // GPS 실패 시 "캐시 선표시 중인가" 판정용 최신 좌표 참조 (updater 내 setState 회피)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    coordsRef.current = coords
  })
  const [radius, setRadius] = useState<number>(1)
  const [tab, setTab] = useState<Tab>('shops')
  // 이동 중 실시간 위치 추적 (watchPosition) — 기본 ON, 토글로 끌 수 있음
  const [liveTracking, setLiveTracking] = useState(true)

  const [shops, setShops] = useState<NearbyShop[]>([])
  const [rooms, setRooms] = useState<NearbyRoom[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shopsViewMode, setShopsViewMode] = useState<ShopsViewMode>('map')
  const [bizCategory, setBizCategory] = useState<BizCategory>('ALL')
  const [focusShopId, setFocusShopId] = useState<string | null>(null)

  // 마운트 직후 캐시 선적용 (hydration mismatch 방지 위해 초기값 대신 첫 effect에서) —
  // 이전 동의자는 동의 API 응답을 기다리지 않고, 마지막 위치로 지도를 즉시 띄운다.
  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_CACHE_KEY) === '1') setLbsConsent('Y')
      const last = readLastPos()
      if (last) setCoords((prev) => prev ?? last)
    } catch {}
  }, [])

  // 마운트 시 동의 여부 확인 (Rule LBS-01) — 서버가 정본. 낙관 캐시와 불일치 시 서버 값으로 교정.
  useEffect(() => {
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        // 401 등 비정상 응답은 '미동의 확정'이 아니다 — Pi 자동인증 완료 전 레이스에서
        // 동의자 캐시를 지우면 게이트가 오뜬다. 정상 200 응답만 정본으로 반영.
        if (d === null) {
          setLbsConsent((prev) => prev ?? 'N')
          return
        }
        const y = d.consent_yn === 'Y'
        setLbsConsent(y ? 'Y' : 'N')
        try {
          if (y) localStorage.setItem(CONSENT_CACHE_KEY, '1')
          else localStorage.removeItem(CONSENT_CACHE_KEY)
        } catch {}
      })
      .catch(() => setLbsConsent((prev) => prev ?? 'N')) // 네트워크 실패 시 낙관 상태 유지
  }, [])

  // GPS 수집 (동의자만) — 실패 원인별 메시지 구분 (권한 차단·측위 불가·타임아웃)
  // fresh: '위치 갱신' 클릭 시 60초 캐시를 무시하고 새로 측위
  // 캐시 좌표로 선표시 중이면: GPS 도착 시 30m 이상 차이일 때만 보정(불필요한 재조회·지도 점프 방지)
  const requestLocation = useCallback((fresh = false) => {
    setLocError(null)
    getCurrentPosition({ fresh })
      .then((pos) => {
        writeLastPos(pos)
        setCoords((prev) =>
          prev &&
          haversineKm(prev.lat, prev.lng, pos.lat, pos.lng) <
            LIVE_MOVE_THRESHOLD_KM
            ? prev
            : pos,
        )
      })
      .catch((e: Error) => {
        // 캐시 좌표로 이미 표시 중이면 GPS 실패를 치명 오류로 띄우지 않음 (조용한 폴백)
        if (!coordsRef.current) setLocError(e.message)
      })
  }, [])

  // 동의자 진입 시 자동으로 위치 1회 수집 — 캐시 선표시 중이어도 GPS는 병행 시작(도착 시 보정)
  const [gpsStarted, setGpsStarted] = useState(false)
  useEffect(() => {
    if (lbsConsent === 'Y' && !gpsStarted) {
      setGpsStarted(true)
      requestLocation()
    }
  }, [lbsConsent, gpsStarted, requestLocation])

  // 이동 중 실시간 추적 — 동의자 + liveTracking ON일 때 watchPosition 구독.
  // 30m 이상 이동했을 때만 좌표를 갱신 → 기존 조회 effect가 자동으로 거리순 재정렬.
  // (멈춰 있으면 좌표 동일 → 재조회 없음, 걸어가면 목록이 실시간으로 바뀐다)
  useEffect(() => {
    if (lbsConsent !== 'Y' || !liveTracking) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        writeLastPos(next) // 다음 진입 선표시용 최신 위치 유지
        setCoords((prev) =>
          prev &&
          haversineKm(prev.lat, prev.lng, next.lat, next.lng) <
            LIVE_MOVE_THRESHOLD_KM
            ? prev // 미미한 이동(GPS 지터)은 무시해 재조회 방지
            : next,
        )
        setLocError(null)
      },
      () => {}, // 일시적 측위 실패는 무시 — 다음 콜백에서 회복
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [lbsConsent, liveTracking])

  // 좌표·반경 변경 시 주변 데이터 로드 — API 실패는 빈 목록으로 위장하지 않고 표시
  useEffect(() => {
    if (lbsConsent !== 'Y' || !coords) return
    const sp = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radius: String(radius),
    })
    setLoading(true)
    setLoadError(null)
    const fetchJson = async (url: string) => {
      const r = await piFetch(url)
      const body = (await r.json().catch(() => ({}))) as {
        error?: string
        shops?: NearbyShop[]
        rooms?: NearbyRoom[]
      }
      if (!r.ok) throw new Error(body.error ?? `조회 실패 (${r.status})`)
      return body
    }
    Promise.all([
      fetchJson(`/api/location/nearby/shops?${sp}`),
      fetchJson(`/api/location/nearby/rooms?${sp}`),
    ])
      .then(([s, r]) => {
        setShops(s.shops ?? [])
        setRooms(r.rooms ?? [])
      })
      .catch((e: Error) => {
        setShops([])
        setRooms([])
        setLoadError(e.message)
      })
      .finally(() => setLoading(false))
  }, [lbsConsent, coords, radius])

  // 동의 여부 확인 중
  if (lbsConsent === null) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }

  // 미동의 — 동의 유도 CTA (Rule LBS-01: UI 자체를 위치 기능으로 노출하지 않음)
  if (lbsConsent === 'N') {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-5xl">📍</p>
        <div className="space-y-1">
          <p className="font-medium">{t('consentRequired')}</p>
          <p className="text-muted-foreground text-sm">{t('consentBenefit')}</p>
        </div>
        <Button onClick={() => setConsentOpen(true)}>{t('consentCta')}</Button>
        <LbsConsentDialog
          open={consentOpen}
          onOpenChange={setConsentOpen}
          onConsented={() => {
            setLbsConsent('Y')
            requestLocation()
          }}
        />
      </div>
    )
  }

  // 동의자 — 위치 미수집 상태
  if (!coords) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-5xl">📡</p>
        <p className="text-muted-foreground text-sm">
          {locError ?? t('locating')}
        </p>
        {locError && (
          <Button variant="outline" onClick={() => requestLocation(true)}>
            {t('retry')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 타이틀 + 반경 선택 (한 줄) */}
      <div className="flex items-center gap-2">
        <h1 className="shrink-0 text-lg font-semibold">{t('nearbyTitle')}</h1>
        <div className="flex items-center gap-1.5">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${radius === r ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {r}km
            </button>
          ))}
        </div>
      </div>

      {/* API 조회 실패 — 빈 목록으로 위장하지 않고 원인 표시 */}
      {loadError && (
        <p className="text-destructive rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-900 dark:bg-red-950">
          ⚠️ {loadError}
        </p>
      )}

      {/* 탭 + 위치 갱신 (한 줄) */}
      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setTab('shops')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'shops' ? 'border-primary text-primary border-b-2' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('tabShops')} {shops.length > 0 && `(${shops.length})`}
        </button>
        <button
          onClick={() => setTab('rooms')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'rooms' ? 'border-primary text-primary border-b-2' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('tabRooms')} {rooms.length > 0 && `(${rooms.length})`}
        </button>
        {/* 이동 중 실시간 추적 토글 — ON이면 걸어가는 대로 거리순 목록이 갱신됨 */}
        <button
          onClick={() => setLiveTracking((v) => !v)}
          className={`ml-auto pb-2 text-xs font-medium transition-colors ${liveTracking ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          aria-pressed={liveTracking}
        >
          {liveTracking ? t('liveOn') : t('liveOff')}
        </button>
        <button
          onClick={() => requestLocation(true)}
          className="text-muted-foreground hover:text-foreground ml-3 pb-2 text-xs underline"
        >
          {t('refreshLocation')}
        </button>
      </div>

      {/* 첫 로드(데이터 없음)만 풀 로딩 — 재조회 중엔 지도·목록을 유지해 언마운트 깜빡임 제거 */}
      {loading && shops.length === 0 && rooms.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('searching')}
        </p>
      ) : tab === 'shops' ? (
        <LazySection
          fallback={<div className="bg-muted h-96 animate-pulse rounded-lg" />}
          rootMargin="50px"
        >
          <div className="space-y-3">
            {/* 툴바: [🗺️ 지도] [☰ 등록매장목록] ... [카테고리 ▼] */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShopsViewMode('map')}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  shopsViewMode === 'map'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {t('mapView')}
              </button>
              <button
                onClick={() => {
                  setShopsViewMode('list')
                  setBizCategory('ALL')
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  shopsViewMode === 'list'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {t('registeredShops')}
              </button>
              <div className="flex-1" />
              <select
                value={bizCategory}
                onChange={(e) => {
                  const val = e.target.value as BizCategory
                  setBizCategory(val)
                  if (val !== 'ALL') setShopsViewMode('map')
                }}
                className="text-foreground bg-background rounded-md border px-2 py-1.5 text-xs font-medium focus:outline-none"
              >
                {BIZ_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`bizCatOption.${cat}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* 지도 뷰: ALL=Pi 매장, 나머지=Google Places */}
            {shopsViewMode === 'map' ? (
              <ShopsMapView
                shops={shops}
                userLat={coords.lat}
                userLng={coords.lng}
                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                bizCategory={bizCategory}
                radiusMeters={radius * 1000}
                focusShopId={focusShopId}
              />
            ) : shops.length === 0 ? (
              <p className="text-muted-foreground py-16 text-center text-sm">
                {t('noShops', { radius })}
              </p>
            ) : (
              <ul className="space-y-2">
                {shops.map((s) => (
                  <li
                    key={s.shop_id}
                    onClick={() => {
                      setFocusShopId(s.shop_id)
                      setShopsViewMode('map')
                    }}
                    className="hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        <span className="truncate text-amber-600 dark:text-amber-400">
                          {s.shop_nm}
                        </span>
                        {s.owner_verified_yn === 'Y' && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                            {t('verified')}
                          </span>
                        )}
                      </p>
                      {s.addr && (
                        <p className="text-muted-foreground truncate text-xs">
                          {s.addr}
                        </p>
                      )}
                      {s.biz_hour && (
                        // 저장된 개행(\n, 요일별) 유지 — 아이콘·텍스트 2열로 둘째 줄 이하 정렬
                        <p className="text-muted-foreground flex gap-1 text-xs">
                          <span>🕒</span>
                          <span className="whitespace-pre-line">
                            {s.biz_hour}
                          </span>
                        </p>
                      )}
                      {/* 판매중 메뉴 썸네일 — 탭 시 상품 상세로 (카드의 지도 포커스와 분리) */}
                      {(s.items?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
                          {s.items!.map((it) => (
                            <Link
                              key={it.item_id}
                              href={`/store/${it.item_id}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`${it.item_nm} · ${Number(it.price_pi)} π`}
                              className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border"
                            >
                              {it.thumbnail_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={it.thumbnail_url}
                                  alt={it.item_nm}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-lg">🛒</span>
                              )}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-primary bg-muted shrink-0 rounded-full px-2 py-1 text-xs font-medium">
                      📍 {formatDistance(s.distance_km)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </LazySection>
      ) : (
        <LazySection
          fallback={<div className="bg-muted h-96 animate-pulse rounded-lg" />}
          rootMargin="50px"
        >
          {rooms.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {t('noRooms', { radius })}
            </p>
          ) : (
            <ul className="space-y-2">
              {rooms.map((r) => (
                <Link
                  key={r.room_id}
                  href={`/chat/${r.room_id}`}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-3 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-2xl">{r.theme_emoji}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.room_nm}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {r.sigungu_nm ? `${r.sigungu_nm} · ` : ''}
                        {themeName(r.theme_cd, r.theme_nm)}
                      </p>
                    </div>
                  </div>
                  <span className="text-primary bg-muted shrink-0 rounded-full px-2 py-1 text-xs font-medium">
                    📍 {formatDistance(r.distance_km)}
                  </span>
                </Link>
              ))}
            </ul>
          )}
        </LazySection>
      )}
    </div>
  )
}
