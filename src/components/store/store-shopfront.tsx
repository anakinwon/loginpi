'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { formatCcy } from '@/lib/format-ccy'
import { deriveTradeStatus, TRADE_ST_STYLE } from '@/lib/mps-trade-status'
import { ItemRow, type StoreItem } from './store-item-list'

// 매장 스토어프론트 상품 그리드 (FR-15·SCR-10) — 특정 매장의 상품을 예쁘게 모아보기.
// 방문자: 카드 클릭 → 상품 상세(카트 담기·구매). 공개(게스트 포함).
// 매장 주인 본인(userId === ownerSellerId): 카드 클릭 → 상품 수정 + 메뉴 추가 버튼.
// owner 판별을 클라이언트(usePiAuth)에서 하는 이유: Pi Browser는 쿠키 미저장이라
// 서버 세션이 본인인데도 null일 수 있음 → 클라이언트 게이트 패턴 준수.
export function StoreShopfront({
  shopId,
  ownerSellerId,
}: {
  shopId: string
  ownerSellerId?: string
}) {
  const t = useTranslations('store')
  const locale = useLocale()
  const { user, isInPiBrowser } = usePiAuth()
  const isOwner = !!ownerSellerId && user?.userId === ownerSellerId
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

  return (
    <div className="space-y-4">
      {/* 본인 매장일 때만: 수정 안내 배너 + 메뉴 추가 버튼 */}
      {isOwner && (
        <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">{t('shopfrontOwnerHint')}</p>
          <Link
            href={`/store/my/shop-items/new?shop=${shopId}`}
            className="bg-primary text-primary-foreground shrink-0 rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90"
          >
            {t('shopfrontAddItem')}
          </Link>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('noItems')}
        </p>
      ) : isInPiBrowser ? (
        // Pi Browser: 스타벅스 Order 스타일 1열 리스트 (소유자는 클릭 시 수정)
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <ItemRow
              key={item.item_id}
              item={item}
              locale={locale}
              t={t}
              href={
                isOwner
                  ? `/store/my/items/${item.item_id}/edit`
                  : `/store/${item.item_id}`
              }
              ownerBadge={isOwner}
            />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const tradeSt = deriveTradeStatus(item)
            // 본인 매장이면 수정 화면으로, 아니면 공개 상품 상세로
            const href = isOwner
              ? `/store/my/items/${item.item_id}/edit`
              : `/store/${item.item_id}`
            return (
              <Link
                key={item.item_id}
                href={href}
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
                  {/* 본인 매장: 수정 가능 배지 (우상단) */}
                  {isOwner && (
                    <span className="bg-primary text-primary-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
                      {t('shopfrontEditBadge')}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium text-sky-600 dark:text-sky-400">
                    {item.item_nm}
                  </p>
                  <p className="text-base font-bold">
                    {Number(item.price_pi)} π
                  </p>
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
      )}
    </div>
  )
}
