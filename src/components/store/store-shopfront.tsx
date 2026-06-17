'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { formatCcy } from '@/lib/format-ccy'
import { deriveTradeStatus, TRADE_ST_STYLE } from '@/lib/mps-trade-status'
import type { StoreItem } from './store-item-list'

// 매장 스토어프론트 상품 그리드 (FR-15·SCR-10) — 특정 매장의 상품을 예쁘게 모아보기.
// 카드 클릭 → 상품 상세(거기서 카트 담기·구매). 공개(게스트 포함).
export function StoreShopfront({ shopId }: { shopId: string }) {
  const t = useTranslations('store')
  const locale = useLocale()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/store/items?shop=${shopId}&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: StoreItem[] } | null) => setItems(d?.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shopId])

  if (loading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('noItems')}
      </p>
    )
  }

  return (
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
              <span
                className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${TRADE_ST_STYLE[tradeSt]}`}
              >
                {t(`tradeSt.${tradeSt}`)}
              </span>
            </div>
            <div className="space-y-1 p-3">
              <p className="truncate text-sm font-medium">{item.item_nm}</p>
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
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
