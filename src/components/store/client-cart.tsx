'use client'

import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { formatCcy } from '@/lib/format-ccy'
import {
  useCart,
  cartTotals,
  setQty,
  removeFromCart,
  clearCart,
} from '@/hooks/use-cart'

// 장바구니(카트) 화면 (SCR-09) — 오프라인매장 다중상품 카트 보기·편집 (FR-14)
// 카트 상태는 클라이언트 전역 스토어(useCart). 체크아웃 백엔드(mps_order_item)는 후속.
export function ClientCart() {
  const t = useTranslations('store')
  const locale = useLocale()
  const cart = useCart()
  const totals = cartTotals(cart)

  if (cart.lines.length === 0) {
    return (
      <div className="space-y-3 py-16 text-center">
        <p className="text-4xl">🛒</p>
        <p className="text-muted-foreground text-sm">{t('cart.empty')}</p>
        <Link href="/store">
          <Button variant="outline">{t('cart.continueShopping')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t('cart.title')}</h1>
        {cart.shopNm && (
          <span className="text-muted-foreground truncate text-sm">
            🏪 {cart.shopNm}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {cart.lines.map((l) => (
          <div
            key={l.itemId}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <div className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded">
              {l.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.thumbUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl">🛒</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/store/${l.itemId}`}
                className="truncate text-sm font-medium hover:underline"
              >
                {l.itemNm}
              </Link>
              <p className="text-muted-foreground text-xs">
                {l.unitPricePi} π
                {l.ccyCd &&
                  l.ccyAmt != null &&
                  ` · ≈ ${formatCcy(locale, l.ccyCd, l.ccyAmt)}`}
              </p>
            </div>
            {/* 수량 스테퍼 */}
            <div className="flex shrink-0 items-center rounded-lg border">
              <button
                type="button"
                aria-label="−"
                onClick={() => setQty(l.itemId, l.qty - 1)}
                className="hover:bg-muted px-2.5 py-1.5 text-sm leading-none"
              >
                −
              </button>
              <span className="w-8 text-center text-sm">{l.qty}</span>
              <button
                type="button"
                aria-label="+"
                onClick={() => setQty(l.itemId, l.qty + 1)}
                className="hover:bg-muted px-2.5 py-1.5 text-sm leading-none"
              >
                +
              </button>
            </div>
            <button
              type="button"
              aria-label={t('cart.remove')}
              onClick={() => removeFromCart(l.itemId)}
              className="text-muted-foreground hover:text-destructive shrink-0 px-1 text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <button
          type="button"
          onClick={clearCart}
          className="text-destructive text-xs underline"
        >
          {t('cart.clear')}
        </button>
        <div className="text-right">
          <p className="text-lg font-bold">{totals.pi} π</p>
          {totals.ccyCd && totals.ccyAmt != null && (
            <p className="text-muted-foreground text-xs">
              ≈ {formatCcy(locale, totals.ccyCd, totals.ccyAmt)}
            </p>
          )}
        </div>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={() => toast.info(t('cart.checkoutPending'))}
      >
        {t('cart.checkout', { count: totals.count })}
      </Button>
    </div>
  )
}
