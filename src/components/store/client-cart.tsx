'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link, useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { formatCcy } from '@/lib/format-ccy'
import {
  useCart,
  cartTotals,
  setQty,
  removeFromCart,
  clearCart,
} from '@/hooks/use-cart'

const round7 = (n: number) => Math.round(n * 1e7) / 1e7

// 장바구니(카트) 화면 (SCR-09) — 오프라인매장 다중상품 카트 보기·편집 (FR-14)
// 카트 상태는 클라이언트 전역 스토어(useCart). 체크아웃 백엔드(mps_order_item)는 후속.
export function ClientCart() {
  const t = useTranslations('store')
  const locale = useLocale()
  const cart = useCart()
  const totals = cartTotals(cart)
  const router = useRouter()
  const { user } = usePiAuth()
  const [checking, setChecking] = useState(false)

  // 체크아웃 — 카트 → 다중라인 주문 1건 + 단일 Pi 결제(에스크로). buy() 흐름 미러링.
  async function checkout() {
    if (cart.lines.length === 0 || !cart.shopId) return
    if (!user) {
      toast.error(t('loginRequired'))
      return
    }
    if (typeof window === 'undefined' || !window.Pi) {
      toast.error(t('piBrowserOnly'))
      return
    }
    setChecking(true)
    try {
      const res = await piFetch('/api/store/orders/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: cart.shopId,
          items: cart.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
        }),
      })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? t('cart.checkoutFail'))
      }
      const prep = (await res.json()) as {
        order: { order_id: string }
        amount: number
        memo: string
        metadata: Record<string, unknown>
      }
      const orderId = prep.order.order_id
      // 결제 중단·오류 시 PENDING 카트 주문 롤백(라인 전체 재고 복원)
      const rollback = () => {
        void piFetch('/api/store/orders/cart/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, reason: '결제 미완료' }),
        })
      }
      window.Pi.createPayment(
        { amount: prep.amount, memo: prep.memo, metadata: prep.metadata },
        {
          onReadyForServerApproval: async (paymentId: string) => {
            await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
          },
          onReadyForServerCompletion: async (
            paymentId: string,
            txid: string,
          ) => {
            const r = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            setChecking(false)
            if (r.ok) {
              clearCart()
              toast.success(t('cart.checkoutSuccess'))
              router.push('/store/my/orders')
            } else {
              toast.error(t('cart.checkoutFail'))
            }
          },
          onCancel: () => {
            rollback()
            setChecking(false)
          },
          onError: (e: Error) => {
            rollback()
            setChecking(false)
            toast.error(e.message)
          },
        },
      )
    } catch (e) {
      setChecking(false)
      toast.error(e instanceof Error ? e.message : t('cart.checkoutFail'))
    }
  }

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
              {/* 단가 × 수량 */}
              <p className="text-muted-foreground text-xs">
                {l.unitPricePi} π × {l.qty}
                {l.ccyCd &&
                  l.ccyAmt != null &&
                  ` (≈ ${formatCcy(locale, l.ccyCd, l.ccyAmt)})`}
              </p>
              {/* = 소계(단가 × 수량) */}
              <p className="text-sm font-semibold">
                = {round7(l.unitPricePi * l.qty)} π
                {l.ccyCd && l.ccyAmt != null && (
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    ≈ {formatCcy(locale, l.ccyCd, l.ccyAmt * l.qty)}
                  </span>
                )}
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
        disabled={checking}
        onClick={checkout}
      >
        {checking
          ? t('cart.checkingOut')
          : t('cart.checkout', { count: totals.count })}
      </Button>
    </div>
  )
}
