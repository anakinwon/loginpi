'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import {
  canPurchase,
  deriveTradeStatus,
  TRADE_ST_STYLE,
} from '@/lib/mps-trade-status'
import { formatCcy } from '@/lib/format-ccy'
import { addToCart, replaceShopAndAdd } from '@/hooks/use-cart'

interface ItemImage {
  img_id: string
  img_url: string
}

interface ItemDetail {
  item_id: string
  seller_id: string
  item_nm: string
  item_desc: string | null
  price_pi: number
  ccy_cd: string | null
  ccy_amt: number | null
  fx_snap_dtm: string | null
  item_cnd_cd: 'NEW' | 'USED' | 'HANDMADE'
  item_st_cd: string
  stock_qty: number
  reg_qty: number
  view_cnt: number
  thumbnail_url: string | null
  images: ItemImage[]
  shop: {
    shop_id: string
    shop_nm: string
    shop_type_cd: string
    addr: string | null
    dlvr_yn?: string | null
  } | null
  seller_bonded: boolean // 판매자 보증금 활성 — 취소수수료 0.1π 발생 거래 (FR-10 단서 공시)
  trading_cnt: number // 진행 중 주문 수 — 거래중/판매완료 배지 구분
}

interface OrderPrep {
  order: { order_id: string }
  amount: number
  memo: string
  metadata: Record<string, unknown>
}

export function StoreItemDetail({ itemId }: { itemId: string }) {
  const t = useTranslations('store')
  const locale = useLocale()
  const router = useRouter()
  const { user } = usePiAuth()
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>(
    'loading',
  )
  const [activeImg, setActiveImg] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  // 주문방법 3종 (기본 매장이용) + 배달주소
  const [orderMthd, setOrderMthd] = useState<'DINE_IN' | 'PICKUP' | 'DELIVERY'>(
    'DINE_IN',
  )
  const [dlvrAddr, setDlvrAddr] = useState('')
  const [qty, setQty] = useState(1) // 카트 담기 수량(오프라인매장)

  useEffect(() => {
    void (async () => {
      const res = await piFetch(`/api/store/items/${itemId}`)
      if (!res.ok) {
        setState('notfound')
        return
      }
      const data = (await res.json()) as { item: ItemDetail }
      setItem(data.item)
      setActiveImg(
        data.item.thumbnail_url ?? data.item.images[0]?.img_url ?? null,
      )
      setState('ready')
    })()
  }, [itemId])

  // 결제 중단·실패 시 주문 취소 → 선점된 재고 복원
  async function rollbackOrder(orderId: string) {
    await piFetch(`/api/store/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '결제 미완료 (사용자 취소 또는 오류)' }),
    })
  }

  async function buy() {
    if (!user) {
      toast.error(t('loginRequired'))
      return
    }
    if (!window.Pi) {
      toast.error(t('piBrowserOnly'))
      return
    }
    if (orderMthd === 'DELIVERY' && !dlvrAddr.trim()) {
      toast.error('배달 위치를 입력해주세요')
      return
    }
    setBuying(true)
    try {
      const res = await piFetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          order_mthd_cd: orderMthd,
          dlvr_addr: orderMthd === 'DELIVERY' ? dlvrAddr.trim() : undefined,
        }),
      })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? t('buyFail'))
      }
      const prep = (await res.json()) as OrderPrep
      const orderId = prep.order.order_id

      window.Pi.createPayment(
        { amount: prep.amount, memo: prep.memo, metadata: prep.metadata },
        {
          onReadyForServerApproval: async (paymentId) => {
            await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            const r = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            setBuying(false)
            if (r.ok) {
              toast.success(t('buySuccess'))
              router.push('/store/my/orders')
            } else {
              toast.error(t('buyFail'))
            }
          },
          onCancel: () => {
            void rollbackOrder(orderId)
            setBuying(false)
          },
          onError: (e) => {
            void rollbackOrder(orderId)
            setBuying(false)
            toast.error(e.message)
          },
        },
      )
    } catch (e) {
      setBuying(false)
      toast.error(e instanceof Error ? e.message : t('buyFail'))
    }
  }

  if (state === 'loading') {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }
  if (state === 'notfound' || !item) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('itemNotFound')}
      </p>
    )
  }

  // 구매 가능: 판매중(OPEN) + 거래중 수량을 뺀 재고 존재 — CLOSED·SOLD·재고 0은 비활성
  const buyable = canPurchase(item)
  const tradeSt = deriveTradeStatus(item)
  const isMine = user?.userId === item.seller_id
  // 관리자는 본인 상품도 테스트 결제 가능 (서버도 isAdmin으로 동일 허용)
  const isAdminUser = user?.role === 'ADMIN' || user?.role === 'MASTER'
  const canSelfTest = isMine && isAdminUser
  const gallery =
    item.images.length > 0
      ? item.images.map((i) => i.img_url)
      : item.thumbnail_url
        ? [item.thumbnail_url]
        : []

  // 카트 담기 — 오프라인매장 상품(shop 보유)·구매가능·본인상품 아님(또는 관리자 테스트)일 때만
  const offlineCart = !!item.shop && buyable && (!isMine || canSelfTest)
  const maxQty = item.reg_qty === 9999 ? 9999 : item.stock_qty

  function addCart() {
    if (!item?.shop) return
    const input = {
      shopId: item.shop.shop_id,
      shopNm: item.shop.shop_nm,
      line: {
        itemId: item.item_id,
        itemNm: item.item_nm,
        thumbUrl: item.thumbnail_url,
        unitPricePi: Number(item.price_pi),
        ccyCd: item.ccy_cd,
        ccyAmt: item.ccy_amt,
        stockQty: maxQty,
        qty,
      },
    }
    const res = addToCart(input)
    if (res.conflict) {
      // 카트에 다른 매장 상품이 있음 — 비우고 새로 담기 확인
      if (confirm(t('cart.conflictConfirm'))) {
        replaceShopAndAdd(input)
        toast.success(t('cart.added', { n: qty }))
      }
      return
    }
    toast.success(t('cart.added', { n: qty }))
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 이미지 갤러리 */}
      <div className="space-y-2">
        <div className="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg">
          {activeImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeImg}
              alt={item.item_nm}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-6xl">🛒</span>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {gallery.map((url) => (
              <button
                key={url}
                onClick={() => setActiveImg(url)}
                className={`size-16 shrink-0 overflow-hidden rounded border-2 ${activeImg === url ? 'border-primary' : 'border-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 상품 정보 */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            {/* 거래 상태 배지 — 판매중·거래중·판매완료 (CLOSED는 게시중단으로 표시) */}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TRADE_ST_STYLE[tradeSt]}`}
            >
              {item.item_st_cd === 'CLOSED'
                ? t('itemSt.CLOSED')
                : t(`tradeSt.${tradeSt}`)}
            </span>
            {item.trading_cnt > 0 && (
              <span className="text-muted-foreground text-xs">
                {t('tradingCount', { count: item.trading_cnt })}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-xl font-bold">{item.item_nm}</h1>
          <p className="mt-2 text-2xl font-bold">{Number(item.price_pi)} π</p>
          {/* 등록 당시 자국통화 참고가 — 등록시점 고정값(실시간 틱커 아님), 통화 등록 상품만 항상 표시 */}
          {item.ccy_cd && item.ccy_amt != null && (
            <p className="text-muted-foreground mt-1 text-sm">
              ≈ {formatCcy(locale, item.ccy_cd, Number(item.ccy_amt))}
              {item.fx_snap_dtm && (
                <span className="ml-1 text-xs">
                  ·{' '}
                  {t('fiatRefAt', {
                    date: new Date(item.fx_snap_dtm).toLocaleDateString(locale),
                  })}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
          <span className="bg-muted rounded-full px-2.5 py-0.5">
            {t(`cnd.${item.item_cnd_cd}`)}
          </span>
          {item.reg_qty !== 9999 && (
            <span className="bg-muted rounded-full px-2.5 py-0.5">
              {t('stockLeft', { count: item.stock_qty })}
            </span>
          )}
          <span className="bg-muted rounded-full px-2.5 py-0.5">
            {t('viewCount', { count: item.view_cnt })}
          </span>
          {item.seller_bonded ? (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              🛡️ {t('bond.badgeBonded')}
            </span>
          ) : (
            <span className="bg-muted rounded-full px-2.5 py-0.5">
              {t('bond.badgeFree')}
            </span>
          )}
        </div>

        {/* 보증금 거래 공시 — 구매자가 취소수수료 발생 여부를 거래 전에 인지 (FR-10) */}
        <p className="text-muted-foreground text-xs">
          {item.seller_bonded
            ? t('bond.buyerNoticeBonded')
            : t('bond.buyerNoticeFree')}
        </p>

        {item.item_desc && (
          <p className="text-sm whitespace-pre-wrap">{item.item_desc}</p>
        )}

        {item.shop && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">🏪 {item.shop.shop_nm}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t(`shopType.${item.shop.shop_type_cd}`)}
              {item.shop.addr && ` · ${item.shop.addr}`}
            </p>
          </div>
        )}

        {/* 주문방법 3종 — 매장이용·픽업·배달(배달가능 매장만). 배달 시 위치 입력 */}
        {(!isMine || canSelfTest) && (
          <div className="space-y-2">
            <p className="text-sm font-medium">주문방법</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { cd: 'DINE_IN', label: '🍽️ 매장이용' },
                  { cd: 'PICKUP', label: '🥡 픽업이용' },
                  ...(item.shop?.dlvr_yn === 'Y'
                    ? [{ cd: 'DELIVERY', label: '🛵 배달이용' }]
                    : []),
                ] as const
              ).map((m) => (
                <button
                  key={m.cd}
                  type="button"
                  onClick={() =>
                    setOrderMthd(m.cd as 'DINE_IN' | 'PICKUP' | 'DELIVERY')
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    orderMthd === m.cd
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {orderMthd === 'DELIVERY' && (
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs">
                  배달 위치 *
                </label>
                <input
                  value={dlvrAddr}
                  onChange={(e) => setDlvrAddr(e.target.value)}
                  placeholder="배달받을 주소를 입력하세요"
                  maxLength={500}
                  className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          {canSelfTest && (
            <p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              ⚠️ 관리자 테스트 결제 — 본인 상품을 결제합니다
            </p>
          )}
          {isMine && !canSelfTest ? (
            <p className="text-muted-foreground text-sm">{t('myOwnItem')}</p>
          ) : (
            <div className="space-y-2">
              {/* 오프라인매장: 수량 입력 + 카트 담기 (구매하기와 함께) */}
              {offlineCart && (
                <div className="flex items-stretch gap-2">
                  <div className="flex items-center rounded-lg border">
                    <button
                      type="button"
                      aria-label="−"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="hover:bg-muted px-3 py-2 text-lg leading-none"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={qty}
                      onChange={(e) =>
                        setQty(
                          Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)),
                        )
                      }
                      aria-label={t('cart.qty')}
                      className="w-12 bg-transparent text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      aria-label="+"
                      onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                      className="hover:bg-muted px-3 py-2 text-lg leading-none"
                    >
                      +
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={addCart}
                  >
                    {t('cart.add')}
                  </Button>
                </div>
              )}
              <Button
                onClick={buy}
                disabled={!buyable || buying}
                className="w-full"
                size="lg"
              >
                {buying
                  ? t('buying')
                  : buyable
                    ? t('buyEscrow')
                    : tradeSt === 'TRADING'
                      ? t('tradeSt.TRADING')
                      : item.item_st_cd === 'CLOSED'
                        ? t('notOnSale')
                        : t('soldOut')}
              </Button>
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-center text-xs">
            {t('escrowNotice')}
          </p>
        </div>
      </div>
    </div>
  )
}
