'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { deriveTradeStatus, TRADE_ST_STYLE } from '@/lib/mps-trade-status'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import { LbsConsentDialog } from '@/components/lbs/lbs-consent-dialog'

export interface StoreItem {
  item_id: string
  item_nm: string
  price_pi: number
  item_cnd_cd: 'NEW' | 'USED' | 'HANDMADE'
  item_st_cd: string
  stock_qty: number
  reg_qty: number
  view_cnt: number
  thumbnail_url: string | null
  reg_dtm: string
  trading_cnt: number
  distance_km?: number | null
}

const CND_LIST = ['NEW', 'USED', 'HANDMADE'] as const
// 기본 뷰(1페이지·검색/필터 없음·좌표 없음)만 localStorage SWR 캐시 — 재방문 즉시 표시
const STORE_CACHE_KEY = 'store_items_default'
const STORE_CACHE_MAX_AGE_MS = 5 * 60_000
const BASE_SORT_LIST = ['latest', 'price_asc', 'price_desc', 'views'] as const
type BaseSort = (typeof BASE_SORT_LIST)[number]
type SortType = BaseSort | 'distance'

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

export function StoreItemList() {
  const t = useTranslations('store')
  const [items, setItems] = useState<StoreItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [cnd, setCnd] = useState<string | null>(null)
  const [sort, setSort] = useState<SortType>('latest')
  const [loading, setLoading] = useState(true)

  // LBS 상태 — 동의 여부 + 현재 위치
  const [lbsConsent, setLbsConsent] = useState<'Y' | 'N' | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [locLoading, setLocLoading] = useState(false)

  const limit = 5

  // 마운트 시 LBS 동의 여부 확인 (Rule LBS-01: 동의자에게만 거리 UI 노출)
  useEffect(() => {
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        setLbsConsent(d?.consent_yn === 'Y' ? 'Y' : 'N')
      })
      .catch(() => setLbsConsent('N'))
  }, [])

  // 동의자는 마운트 시 자동으로 현재 위치 수집 → 모든 상품 카드에 거리 배지 표시.
  // 정렬은 바꾸지 않는다 (📍 주변순 버튼과 별개 — 거리 표시 전용)
  useEffect(() => {
    if (lbsConsent !== 'Y' || userLat !== null || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setPage(1)
      },
      () => {}, // 거부·실패 시 거리 없이 목록만 표시
      { timeout: 10000 },
    )
  }, [lbsConsent, userLat])

  // GPS 위치 수집 (동의자만 — Rule LBS-01)
  const requestLocation = useCallback(() => {
    if (lbsConsent !== 'Y' || !navigator.geolocation) return
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setSort('distance')
        setPage(1)
        setLocLoading(false)
      },
      () => {
        setLocLoading(false)
      },
      { timeout: 10000 },
    )
  }, [lbsConsent])

  const load = useCallback(async () => {
    // 기본 뷰: 캐시 즉시 표시 (SWR) → 아래 네트워크 응답으로 교체
    const isDefaultView =
      page === 1 && !keyword && !cnd && sort === 'latest' && userLat === null
    let servedFromCache = false
    if (isDefaultView) {
      const cached = readCache<{ items: StoreItem[]; total: number }>(
        STORE_CACHE_KEY,
        STORE_CACHE_MAX_AGE_MS,
      )
      if (cached) {
        setItems(cached.items)
        setTotal(cached.total)
        servedFromCache = true
      }
    }
    setLoading(!servedFromCache)

    const sp = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    })
    if (keyword) sp.set('q', keyword)
    if (cnd) sp.set('cnd', cnd)
    // 좌표가 있으면 항상 전달 → 모든 정렬에서 distance_km 수신 (반경 필터는 주변순만)
    if (userLat !== null && userLng !== null) {
      sp.set('lat', String(userLat))
      sp.set('lng', String(userLng))
      if (sort === 'distance') sp.set('radius', '10')
    }
    try {
      // piFetch: 서버의 LBS 동의 검증(Rule LBS-04)이 Pi Browser에서도 통과하도록 X-Pi-Token 첨부
      const res = await piFetch(`/api/store/items?${sp}`)
      if (res.ok) {
        const data = (await res.json()) as { items: StoreItem[]; total: number }
        // 무한 스크롤 — 첫 페이지는 교체, 이후 페이지는 누적 append
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]))
        setTotal(data.total)
        if (isDefaultView) writeCache(STORE_CACHE_KEY, data)
      }
    } finally {
      setLoading(false)
    }
  }, [page, keyword, cnd, sort, userLat, userLng])

  useEffect(() => {
    void load()
  }, [load])

  // 스크롤 끝 도달 시 다음 페이지 자동 로드
  const hasMore = items.length < total
  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading,
    onLoadMore: () => setPage((p) => p + 1),
  })

  return (
    <div className="space-y-4">
      {/* 검색 + 필터 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setKeyword(searchInput)
        }}
        className="flex gap-2"
      >
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          {t('search')}
        </Button>
        {/* 거리순 버튼 — 동의자: 즉시 GPS, 미동의자: 동의 유도 다이얼로그 (Rule LBS-01) */}
        {lbsConsent === 'Y' ? (
          <Button
            type="button"
            variant={sort === 'distance' ? 'default' : 'outline'}
            onClick={requestLocation}
            disabled={locLoading}
            className="shrink-0"
          >
            {locLoading ? '📍...' : '📍 주변순'}
          </Button>
        ) : lbsConsent === 'N' ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConsentOpen(true)}
            className="text-muted-foreground shrink-0"
          >
            📍 주변순
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setCnd(null)
            setPage(1)
          }}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${cnd === null ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {t('all')}
        </button>
        {CND_LIST.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCnd(c)
              setPage(1)
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${cnd === c ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t(`cnd.${c}`)}
          </button>
        ))}
        <select
          value={sort === 'distance' ? 'latest' : sort}
          onChange={(e) => {
            setSort(e.target.value as BaseSort)
            setPage(1)
          }}
          className="border-input bg-background ml-auto rounded-md border px-2 py-1 text-xs"
        >
          {BASE_SORT_LIST.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {/* 거리순 활성화 표시 */}
      {sort === 'distance' && userLat !== null && (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <span>📍</span>
          <span>현재 위치 기준 10km 내 상품 (거리 가까운 순)</span>
          <button
            onClick={() => {
              setSort('latest')
              setUserLat(null)
              setUserLng(null)
              setPage(1)
            }}
            className="text-destructive ml-1 underline"
          >
            해제
          </button>
        </p>
      )}

      {/* 상품 그리드 — 추가 로딩 중에는 기존 목록 유지(스켈레톤 깜빡임 방지) */}
      {loading && items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {sort === 'distance' ? '주변 10km 내 상품이 없습니다' : t('noItems')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const tradeSt = deriveTradeStatus(item)
            return (
              <Link
                key={item.item_id}
                href={`/store/${item.item_id}`}
                className="group overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
              >
                <div className="bg-muted relative flex aspect-square items-center justify-center overflow-hidden">
                  {item.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail_url}
                      alt={item.item_nm}
                      className={`h-full w-full object-cover transition-transform group-hover:scale-105 ${tradeSt !== 'OPEN' ? 'opacity-60' : ''}`}
                    />
                  ) : (
                    <span className="text-4xl">🛒</span>
                  )}
                  {/* 거래 상태 배지 — 판매중·거래중·판매완료 */}
                  <span
                    className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${TRADE_ST_STYLE[tradeSt]}`}
                  >
                    {t(`tradeSt.${tradeSt}`)}
                  </span>
                  {/* 거리 배지 — LBS 동의자 + distance_km 있는 경우만 표시 (Rule LBS-04) */}
                  {lbsConsent === 'Y' && item.distance_km != null && (
                    <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                      📍 {formatDistance(item.distance_km)}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">{item.item_nm}</p>
                  <p className="text-base font-bold">
                    {Number(item.price_pi)} π
                  </p>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="bg-muted rounded px-1.5 py-0.5">
                      {t(`cnd.${item.item_cnd_cd}`)}
                    </span>
                    {item.reg_qty !== 9999 && (
                      <span>{t('stockLeft', { count: item.stock_qty })}</span>
                    )}
                    {item.trading_cnt > 0 && (
                      <span>
                        {t('tradingCount', { count: item.trading_cnt })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* 무한 스크롤 sentinel — 뷰포트 진입 시 다음 페이지 자동 fetch */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          <span className="text-muted-foreground animate-pulse text-xs">
            {loading ? t('loading') : '스크롤하여 더 보기…'}
          </span>
        </div>
      )}

      {/* 위치 서비스 동의 다이얼로그 — 미동의 사용자가 📍 주변순 클릭 시 */}
      <LbsConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConsented={() => {
          setLbsConsent('Y')
          // requestLocation()은 stale closure 문제로 직접 geolocation 호출
          if (navigator.geolocation) {
            setLocLoading(true)
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setUserLat(pos.coords.latitude)
                setUserLng(pos.coords.longitude)
                setSort('distance')
                setPage(1)
                setLocLoading(false)
              },
              () => setLocLoading(false),
              { timeout: 10000 },
            )
          }
        }}
      />
    </div>
  )
}
