'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { deriveTradeStatus, TRADE_ST_STYLE } from '@/lib/mps-trade-status'

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
  trading_cnt: number // 진행 중 주문 수 — 거래중/판매완료 배지 구분
}

const CND_LIST = ['NEW', 'USED', 'HANDMADE'] as const
const SORT_LIST = ['latest', 'price_asc', 'price_desc', 'views'] as const

export function StoreItemList() {
  const t = useTranslations('store')
  const [items, setItems] = useState<StoreItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [cnd, setCnd] = useState<string | null>(null)
  const [sort, setSort] = useState<(typeof SORT_LIST)[number]>('latest')
  const [loading, setLoading] = useState(true)

  const limit = 5 // 페이지당 상품 수

  const load = useCallback(async () => {
    setLoading(true)
    const sp = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    })
    if (keyword) sp.set('q', keyword)
    if (cnd) sp.set('cnd', cnd)
    try {
      const res = await fetch(`/api/store/items?${sp}`)
      if (res.ok) {
        const data = (await res.json()) as { items: StoreItem[]; total: number }
        setItems(data.items)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [page, keyword, cnd, sort])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(Math.ceil(total / limit), 1)

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
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort)
            setPage(1)
          }}
          className="border-input bg-background ml-auto rounded-md border px-2 py-1 text-xs"
        >
          {SORT_LIST.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {/* 상품 그리드 */}
      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('noItems')}
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

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      )}
    </div>
  )
}
