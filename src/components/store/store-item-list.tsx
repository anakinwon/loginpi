'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { deriveTradeStatus, TRADE_ST_STYLE } from '@/lib/mps-trade-status'
import { formatCcy } from '@/lib/format-ccy'
import { piFetch } from '@/lib/pi-fetch'
import { usePiAuth } from '@/components/pi-auth-provider'
import { getCurrentPosition } from '@/lib/geo'
import { readCache, writeCache } from '@/lib/client-cache'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import { LbsConsentDialog } from '@/components/lbs/lbs-consent-dialog'

export interface StoreItem {
  item_id: string
  item_nm: string
  price_pi: number
  // 등록시점 자국통화 참고가 — 항상 표시(등록시점 고정값, 실시간 틱커 아님)
  ccy_cd?: string | null
  ccy_amt?: number | null
  item_cnd_cd: 'NEW' | 'USED' | 'HANDMADE'
  item_st_cd: string
  stock_qty: number
  reg_qty: number
  view_cnt: number
  thumbnail_url: string | null
  reg_dtm: string
  trading_cnt: number
  distance_km?: number | null
  // 매장 연결 정보 — listMyItems 응답에만 포함
  shop_id?: string | null
  shop_nm?: string | null
}

// GET /api/store/categories 트리 노드 (2단계)
interface CtgrNode {
  ctgr_id: string
  ctgr_nm: string
  children: CtgrNode[]
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

// next.config.ts의 remotePatterns와 동일한 기준으로 최적화 여부 결정
// NEXT_PUBLIC_SUPABASE_URL 미설정 시 → 최적화 skip (unoptimized fallback)
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function isStorageUrl(url: string): boolean {
  return SUPABASE_ORIGIN !== '' && url.startsWith(SUPABASE_ORIGIN)
}

interface StoreItemListProps {
  mine?: boolean
}

export function StoreItemList({ mine = false }: StoreItemListProps) {
  const t = useTranslations('store')
  const locale = useLocale()
  // Pi Browser에서는 스타벅스 Order 스타일의 간결한 1열 리스트로 표시 (그 외엔 그리드 카드)
  const { isInPiBrowser } = usePiAuth()
  const [items, setItems] = useState<StoreItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [cnd, setCnd] = useState<string | null>(null)
  const [ctgr, setCtgr] = useState<string | null>(null)
  const [ctgrTree, setCtgrTree] = useState<CtgrNode[]>([])
  const [sort, setSort] = useState<SortType>('latest')
  const [loading, setLoading] = useState(true)

  // LBS 상태 — 동의 여부 + 현재 위치
  const [lbsConsent, setLbsConsent] = useState<'Y' | 'N' | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [locLoading, setLocLoading] = useState(false)

  const limit = 20

  // 카테고리 트리 로드 (공개 API) — 내 상품 모드에서는 불필요
  useEffect(() => {
    if (mine) return
    fetch('/api/store/categories')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { categories?: CtgrNode[] } | null) => {
        if (d?.categories) setCtgrTree(d.categories)
      })
      .catch(() => {})
  }, [mine])

  // 마운트 시 LBS 동의 여부 확인 (Rule LBS-01: 동의자에게만 거리 UI 노출) — 내 상품 모드에서는 불필요
  useEffect(() => {
    if (mine) return
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        setLbsConsent(d?.consent_yn === 'Y' ? 'Y' : 'N')
      })
      .catch(() => setLbsConsent('N'))
  }, [mine])

  // 동의자는 마운트 시 자동으로 현재 위치 수집 → 모든 상품 카드에 거리 배지 표시.
  // 정렬은 바꾸지 않는다 (📍 주변순 버튼과 별개 — 거리 표시 전용) — 내 상품 모드에서는 불필요
  // quick 모드: 거리 배지는 부가 기능이라 캐시 우선·저정밀·짧은 timeout으로 첫 로딩 지연을 막는다.
  // (고정밀 8~20s 측위는 '주변순' 버튼 등 명시적 액션에서만)
  useEffect(() => {
    if (mine || lbsConsent !== 'Y' || userLat !== null) return
    getCurrentPosition({ quick: true })
      .then((p) => {
        setUserLat(p.lat)
        setUserLng(p.lng)
        setPage(1)
      })
      .catch(() => {}) // 거부·실패 시 거리 없이 목록만 표시
  }, [lbsConsent, userLat])

  // GPS 위치 수집 (동의자만 — Rule LBS-01) — 실패 시 원인별 메시지 안내
  const requestLocation = useCallback(() => {
    if (lbsConsent !== 'Y') return
    setLocLoading(true)
    getCurrentPosition()
      .then((p) => {
        setUserLat(p.lat)
        setUserLng(p.lng)
        setSort('distance')
        setPage(1)
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLocLoading(false))
  }, [lbsConsent])

  const load = useCallback(async () => {
    // 내 상품 모드 — ?mine=1 단순 호출 (페이지네이션·캐시·LBS 없음)
    if (mine) {
      setLoading(true)
      try {
        const res = await piFetch('/api/store/items?mine=1')
        if (res.ok) {
          const data = (await res.json()) as { items: StoreItem[] }
          setItems(data.items)
          setTotal(data.items.length)
        }
      } finally {
        setLoading(false)
      }
      return
    }

    // 기본 뷰: 캐시 즉시 표시 (SWR) → 아래 네트워크 응답으로 교체
    const isDefaultView =
      page === 1 &&
      !keyword &&
      !cnd &&
      !ctgr &&
      sort === 'latest' &&
      userLat === null
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
    if (ctgr) sp.set('ctgr', ctgr)
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
        // 무한 스크롤 — 첫 페이지는 교체, 이후 페이지는 중복 제거 후 append
        setItems((prev) => {
          if (page === 1) return data.items
          const seen = new Set(prev.map((i) => i.item_id))
          return [...prev, ...data.items.filter((i) => !seen.has(i.item_id))]
        })
        setTotal(data.total)
        if (isDefaultView) writeCache(STORE_CACHE_KEY, data)
      }
    } finally {
      setLoading(false)
    }
  }, [mine, page, keyword, cnd, ctgr, sort, userLat, userLng])

  // 카페 마켓플레이스와 동일하게 입력 즉시(300ms debounce) 검색 — 엔터 불필요
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1)
      setKeyword(searchInput.trim())
    }, 300)
    return () => clearTimeout(id)
  }, [searchInput])

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
      {/* 검색 + 필터 — 내 상품 모드에서는 숨김 */}
      {!mine && (
        <>
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
                {locLoading ? '📍...' : t('nearbySort')}
              </Button>
            ) : lbsConsent === 'N' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConsentOpen(true)}
                className="text-muted-foreground shrink-0"
              >
                {t('nearbySort')}
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
            <div className="ml-auto flex items-center gap-2">
              {ctgrTree.length > 0 && (
                <select
                  value={ctgr ?? ''}
                  onChange={(e) => {
                    setCtgr(e.target.value || null)
                    setPage(1)
                  }}
                  className="border-input bg-background max-w-40 rounded-md border px-2 py-1 text-xs"
                >
                  <option value="">{t('allCategories')}</option>
                  {ctgrTree.map((p) => (
                    <optgroup key={p.ctgr_id} label={p.ctgr_nm}>
                      <option value={p.ctgr_id}>
                        {p.ctgr_nm} · {t('form.categoryAll')}
                      </option>
                      {p.children.map((c) => (
                        <option key={c.ctgr_id} value={c.ctgr_id}>
                          {c.ctgr_nm}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <select
                value={sort === 'distance' ? 'latest' : sort}
                onChange={(e) => {
                  setSort(e.target.value as BaseSort)
                  setPage(1)
                }}
                className="border-input bg-background rounded-md border px-2 py-1 text-xs"
              >
                {BASE_SORT_LIST.map((s) => (
                  <option key={s} value={s}>
                    {t(`sort.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 거리순 활성화 표시 */}
          {sort === 'distance' && userLat !== null && (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <span>📍</span>
              <span>{t('nearbyActive', { radius: 10 })}</span>
              <button
                onClick={() => {
                  setSort('latest')
                  setUserLat(null)
                  setUserLng(null)
                  setPage(1)
                }}
                className="text-destructive ml-1 underline"
              >
                {t('nearbyClear')}
              </button>
            </p>
          )}
        </>
      )}

      {/* 상품 그리드 — 추가 로딩 중에는 기존 목록 유지(스켈레톤 깜빡임 방지) */}
      {loading && items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {mine
            ? t('noMyItems')
            : sort === 'distance'
              ? t('noNearbyItems', { radius: 10 })
              : t('noItems')}
        </p>
      ) : mine ? (
        <MyItemGroups
          items={items}
          locale={locale}
          t={t}
          piMode={isInPiBrowser}
        />
      ) : (
        <PublicItemGroups
          items={items}
          locale={locale}
          t={t}
          lbsConsent={lbsConsent}
          piMode={isInPiBrowser}
        />
      )}

      {/* 무한 스크롤 sentinel — 내 상품 모드에서는 전체 반환이므로 불필요 */}
      {!mine && hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          <span className="text-muted-foreground animate-pulse text-xs">
            {loading ? t('loading') : t('scrollMore')}
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

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────

type TFunc = ReturnType<typeof useTranslations<'store'>>

// memo로 감싸 검색어 입력·GPS 로딩 등 부모 리렌더 시 변하지 않은 카드의 재렌더를 차단.
// item/locale/t/lbsConsent 참조가 안정적이라 기본 얕은 비교로 충분 (PRD_18 SHOP, 필터/정렬 리렌더 -30%)
const ItemCard = memo(function ItemCard({
  item,
  locale,
  t,
  lbsConsent,
  priority = false,
}: {
  item: StoreItem
  locale: string
  t: TFunc
  lbsConsent: 'Y' | 'N' | null
  priority?: boolean
}) {
  const tradeSt = deriveTradeStatus(item)
  return (
    <Link
      href={`/store/${item.item_id}`}
      className="group overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
    >
      <div className="bg-muted relative flex aspect-square items-center justify-center overflow-hidden">
        {item.thumbnail_url ? (
          <Image
            src={item.thumbnail_url}
            alt={item.item_nm}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            unoptimized={!isStorageUrl(item.thumbnail_url)}
            className={`object-cover transition-transform group-hover:scale-105 ${tradeSt !== 'OPEN' ? 'opacity-60' : ''}`}
          />
        ) : (
          <span className="text-4xl">🛒</span>
        )}
        <span
          className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${TRADE_ST_STYLE[tradeSt]}`}
        >
          {t(`tradeSt.${tradeSt}`)}
        </span>
        {lbsConsent === 'Y' && item.distance_km != null && (
          <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            📍 {formatDistance(item.distance_km)}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium text-sky-600 dark:text-sky-400">
          {item.item_nm}
        </p>
        <p className="text-base font-bold">{Number(item.price_pi)} π</p>
        {item.ccy_cd && item.ccy_amt != null && (
          <p className="text-muted-foreground text-xs">
            ≈ {formatCcy(locale, item.ccy_cd, Number(item.ccy_amt))}
          </p>
        )}
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span className="bg-muted rounded px-1.5 py-0.5">
            {t(`cnd.${item.item_cnd_cd}`)}
          </span>
          {item.reg_qty !== 9999 && (
            <span>{t('stockLeft', { count: item.stock_qty })}</span>
          )}
          {item.trading_cnt > 0 && (
            <span>{t('tradingCount', { count: item.trading_cnt })}</span>
          )}
        </div>
      </div>
    </Link>
  )
})

// 스타벅스 Order 스타일 1열 리스트 행 (Pi Browser 전용) — 원형 썸네일 + 제목/가격.
// href·ownerBadge를 받아 메인 목록·스토어프론트(소유자 수정) 양쪽에서 재사용.
export function ItemRow({
  item,
  locale,
  t,
  href,
  lbsConsent = null,
  ownerBadge = false,
  priority = false,
}: {
  item: StoreItem
  locale: string
  t: TFunc
  href: string
  lbsConsent?: 'Y' | 'N' | null
  ownerBadge?: boolean
  priority?: boolean
}) {
  const tradeSt = deriveTradeStatus(item)
  // 미게시 상태(DRAFT·CLOSED) — 소유자 스토어프론트 조회에만 존재. 거래 상태 대신 게시 상태 배지
  const unlisted = item.item_st_cd === 'DRAFT' || item.item_st_cd === 'CLOSED'
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted/50 flex items-center gap-4 px-1 py-3 transition-colors"
      >
        {/* 원형 썸네일 */}
        <div className="bg-muted relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full">
          {item.thumbnail_url ? (
            <Image
              src={item.thumbnail_url}
              alt={item.item_nm}
              fill
              sizes="64px"
              priority={priority}
              unoptimized={!isStorageUrl(item.thumbnail_url)}
              className={`object-cover ${tradeSt !== 'OPEN' ? 'opacity-60' : ''}`}
            />
          ) : (
            <span className="text-2xl">🛒</span>
          )}
        </div>

        {/* 제목 + 가격 + 메타 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold text-sky-600 dark:text-sky-400">
              {item.item_nm}
            </p>
            {ownerBadge && (
              <span className="text-primary shrink-0 text-xs">✏️</span>
            )}
            {unlisted ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {t(`itemSt.${item.item_st_cd}`)}
              </span>
            ) : (
              tradeSt !== 'OPEN' && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TRADE_ST_STYLE[tradeSt]}`}
                >
                  {t(`tradeSt.${tradeSt}`)}
                </span>
              )
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            <span className="text-foreground font-bold">
              {Number(item.price_pi)} π
            </span>
            {item.ccy_cd && item.ccy_amt != null && (
              <span>
                {' '}
                · ≈ {formatCcy(locale, item.ccy_cd, Number(item.ccy_amt))}
              </span>
            )}
          </p>
          <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-muted rounded px-1.5 py-0.5">
              {t(`cnd.${item.item_cnd_cd}`)}
            </span>
            {item.reg_qty !== 9999 && (
              <span>{t('stockLeft', { count: item.stock_qty })}</span>
            )}
            {lbsConsent === 'Y' && item.distance_km != null && (
              <span>📍 {formatDistance(item.distance_km)}</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}

// 공개 스토어 — 오프라인 매장 그룹 vs 직거래 그룹, 각 그룹 내 거리 오름차순
function PublicItemGroups({
  items,
  locale,
  t,
  lbsConsent,
  piMode = false,
}: {
  items: StoreItem[]
  locale: string
  t: TFunc
  lbsConsent: 'Y' | 'N' | null
  piMode?: boolean
}) {
  const tc = useTranslations('common')
  // shop_id 유무로만 분리 — 매장별 세분화 없음
  const shopItems = items
    .filter((i) => i.shop_id)
    .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
  const directItems = items
    .filter((i) => !i.shop_id)
    .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))

  const gridCls = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'

  return (
    <div className="space-y-8">
      {/* 오프라인 매장 상품 그룹 */}
      {shopItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            {t('groupOfflineShop')}
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              ({tc('countItem', { count: shopItems.length })})
            </span>
          </h3>
          {piMode ? (
            <ul className="divide-y rounded-lg border">
              {shopItems.map((item, idx) => (
                <ItemRow
                  key={item.item_id}
                  item={item}
                  locale={locale}
                  t={t}
                  href={`/store/${item.item_id}`}
                  lbsConsent={lbsConsent}
                  priority={idx < 2}
                />
              ))}
            </ul>
          ) : (
            <div className={gridCls}>
              {shopItems.map((item, idx) => (
                <ItemCard
                  key={item.item_id}
                  item={item}
                  locale={locale}
                  t={t}
                  lbsConsent={lbsConsent}
                  priority={idx < 2}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 직거래 상품 그룹 */}
      {directItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            {t('groupDirect')}
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              ({tc('countItem', { count: directItems.length })})
            </span>
          </h3>
          {piMode ? (
            <ul className="divide-y rounded-lg border">
              {directItems.map((item, idx) => (
                <ItemRow
                  key={item.item_id}
                  item={item}
                  locale={locale}
                  t={t}
                  href={`/store/${item.item_id}`}
                  lbsConsent={lbsConsent}
                  priority={shopItems.length === 0 && idx < 2}
                />
              ))}
            </ul>
          ) : (
            <div className={gridCls}>
              {directItems.map((item, idx) => (
                <ItemCard
                  key={item.item_id}
                  item={item}
                  locale={locale}
                  t={t}
                  lbsConsent={lbsConsent}
                  priority={shopItems.length === 0 && idx < 2}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 매장 등록 상품 / 직거래 상품 그룹 — mine 모드 전용
function MyItemGroups({
  items,
  locale,
  t,
  piMode = false,
}: {
  items: StoreItem[]
  locale: string
  t: TFunc
  piMode?: boolean
}) {
  const tc = useTranslations('common')
  // 매장별 그룹핑: shop_id 기준으로 Map 구성, null → 직거래
  const shopMap = new Map<string, { shopNm: string; items: StoreItem[] }>()
  const directItems: StoreItem[] = []

  for (const item of items) {
    if (item.shop_id) {
      const existing = shopMap.get(item.shop_id)
      if (existing) {
        existing.items.push(item)
      } else {
        shopMap.set(item.shop_id, {
          shopNm: item.shop_nm ?? t('shopFallback'),
          items: [item],
        })
      }
    } else {
      directItems.push(item)
    }
  }

  return (
    <div className="space-y-8">
      {/* 매장 등록 상품 — 매장별 섹션 */}
      {shopMap.size > 0 && (
        <div className="space-y-6">
          <h3 className="text-sm font-semibold">{t('groupMyShopItems')}</h3>
          {Array.from(shopMap.entries()).map(([shopId, group]) => (
            <div key={shopId} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-amber-600 dark:text-amber-400">
                  {group.shopNm}
                </span>
                <span className="text-muted-foreground text-xs">
                  ({tc('countItem', { count: group.items.length })})
                </span>
              </div>
              {piMode ? (
                <ul className="divide-y rounded-lg border">
                  {group.items.map((item, idx) => (
                    <ItemRow
                      key={item.item_id}
                      item={item}
                      locale={locale}
                      t={t}
                      href={`/store/${item.item_id}`}
                      priority={idx < 2}
                    />
                  ))}
                </ul>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((item, idx) => (
                    <ItemCard
                      key={item.item_id}
                      item={item}
                      locale={locale}
                      t={t}
                      lbsConsent={null}
                      priority={idx < 2}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 직거래 상품 */}
      {directItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            {t('groupDirect')}
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              ({tc('countItem', { count: directItems.length })})
            </span>
          </h3>
          {piMode ? (
            <ul className="divide-y rounded-lg border">
              {directItems.map((item, idx) => (
                <ItemRow
                  key={item.item_id}
                  item={item}
                  locale={locale}
                  t={t}
                  href={`/store/${item.item_id}`}
                  priority={shopMap.size === 0 && idx < 2}
                />
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {directItems.map((item, idx) => (
                <ItemCard
                  key={item.item_id}
                  item={item}
                  locale={locale}
                  t={t}
                  lbsConsent={null}
                  priority={shopMap.size === 0 && idx < 2}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
