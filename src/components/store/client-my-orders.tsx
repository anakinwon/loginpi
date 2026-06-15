'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { buildGoogleMapsUrl, buildNaverMapUrl, buildKakaoMapUrl } from '@/lib/navigation'
import type { ShopLocation } from '@/lib/navigation'

interface ShopInfo {
  shop_nm: string | null
  addr: string | null
  latd_crd: number | null
  lngt_crd: number | null
  place_id: string | null
}

interface OrderRow {
  order_id: string
  item_id: string
  buyer_id: string
  seller_id: string
  order_price_pi: number
  order_st_cd:
    | 'PENDING'
    | 'ESCROW'
    | 'TRADING'
    | 'SELLER_DONE'
    | 'BUYER_DONE'
    | 'DONE'
    | 'CANCELLED'
  cancel_reason: string | null
  reg_dtm: string
  mps_item: { item_nm: string; thumbnail_url: string | null; mps_shop: ShopInfo | null } | null
}

// ESCROW·SELLER_DONE은 구버전 주문 레거시 상태 — 화면에는 거래중과 동일 계열로 표시
const ST_STYLE: Record<OrderRow['order_st_cd'], string> = {
  PENDING:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  ESCROW:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  TRADING:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  SELLER_DONE:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  BUYER_DONE:
    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-muted text-muted-foreground',
}

// 결제 완료 후 거래 진행 중인 상태 (레거시 포함) — 구매자 수령 확인 가능 구간
const IN_TRADE: OrderRow['order_st_cd'][] = ['TRADING', 'ESCROW', 'SELLER_DONE']

// 주문 관리 (SCR-05 판매 / SCR-06 구매) — 양방향 확인 액션 포함
// serverAuthed: 서버 getSessionUser() 확인 결과 (Google 쿠키 로그인 포함)
export function ClientMyOrders({
  role,
  serverAuthed = false,
}: {
  role: 'buyer' | 'seller'
  serverAuthed?: boolean
}) {
  const t = useTranslations('store')
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<{
    id: string
    action: 'release' | 'complete' | 'cancel'
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch(`/api/store/orders?role=${role}`)
      if (res.ok) {
        const data = (await res.json()) as { orders: OrderRow[] }
        setOrders(data.orders)
      }
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    if (authed) void load()
  }, [authed, load])

  if (!authed && isLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }
  if (!authed) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loginRequired')}
      </p>
    )
  }

  async function act(
    orderId: string,
    action: 'release' | 'complete' | 'cancel',
  ) {
    let body: string | undefined
    if (action === 'cancel') {
      const reason = prompt(t('cancelReasonPrompt'))
      if (!reason?.trim()) return
      body = JSON.stringify({ reason: reason.trim() })
    }
    setActing({ id: orderId, action })
    try {
      const res = await piFetch(`/api/store/orders/${orderId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      })
      if (res.ok) {
        // 취소 응답에 환불 결과가 실려 오면 환불 상태로 안내(구매자 결제분 환불)
        const data = (await res.json().catch(() => ({}))) as {
          refund?: { status: string; amount?: number }
        }
        if (action === 'cancel' && data.refund) {
          if (data.refund.status === 'refunded') {
            toast.success(t('refund.done', { amount: data.refund.amount ?? 0 }))
          } else if (data.refund.status === 'pending') {
            toast.success(t('refund.pending'))
          } else {
            toast.success(t('actionDone.cancel'))
          }
        } else {
          toast.success(t(`actionDone.${action}`))
        }
        void load()
      } else {
        const { error } = (await res.json()) as { error?: string }
        toast.error(error ?? t('saveFail'))
      }
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('noOrders')}
        </p>
      ) : (
        orders.map((o) => {
          const busy = acting?.id === o.order_id
          // 취소 진행 중 여부 — 동일 주문의 수령/완료 액션과 구분해 "취소중"만 정확히 표시
          const canceling = busy && acting?.action === 'cancel'
          return (
            <div key={o.order_id} className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/store/${o.item_id}`}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {o.mps_item?.item_nm ?? t('itemNotFound')}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ST_STYLE[o.order_st_cd]}`}
                >
                  {/* 레거시 ESCROW·SELLER_DONE도 "거래중"으로 표시 */}
                  {t(
                    `orderSt.${IN_TRADE.includes(o.order_st_cd) ? 'TRADING' : o.order_st_cd}`,
                  )}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {Number(o.order_price_pi)} π ·{' '}
                {new Date(o.reg_dtm).toLocaleString()}
                {o.order_st_cd === 'CANCELLED' &&
                  o.cancel_reason &&
                  ` · ${o.cancel_reason}`}
              </p>

              {/* 상태별 액션 — 2단계 확인: ①수령(구매자) ②거래완료(판매자) */}
              <div className="flex flex-wrap gap-1.5">
                {/* 구매자 거래중 상태: 매장 출발하기 버튼 — 딥링크로 네이티브 지도 앱에 위임 */}
                {role === 'buyer' && IN_TRADE.includes(o.order_st_cd) && (() => {
                  const shop = o.mps_item?.mps_shop ?? null
                  const loc: ShopLocation = {
                    place_id: shop?.place_id,
                    latd_crd: shop?.latd_crd,
                    lngt_crd: shop?.lngt_crd,
                    addr: shop?.addr,
                    shop_nm: shop?.shop_nm,
                  }
                  const googleUrl = buildGoogleMapsUrl(loc)
                  const naverUrl = buildNaverMapUrl(loc)
                  const kakaoUrl = buildKakaoMapUrl(loc)
                  if (!googleUrl && !naverUrl && !kakaoUrl) return null
                  return (
                    <div className="flex flex-wrap gap-1">
                      {googleUrl && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(googleUrl, '_blank')}
                        >
                          🗺️ {t('navigateGoogle')}
                        </Button>
                      )}
                      {naverUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(naverUrl, '_blank')}
                        >
                          {t('navigateNaver')}
                        </Button>
                      )}
                      {kakaoUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(kakaoUrl, '_blank')}
                        >
                          {t('navigateKakao')}
                        </Button>
                      )}
                    </div>
                  )
                })()}
                {role === 'buyer' && IN_TRADE.includes(o.order_st_cd) && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act(o.order_id, 'release')}
                  >
                    {t('actionBuyerDone')}
                  </Button>
                )}
                {role === 'seller' && o.order_st_cd === 'BUYER_DONE' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act(o.order_id, 'complete')}
                  >
                    {t('actionComplete')}
                  </Button>
                )}
                {(o.order_st_cd === 'PENDING' ||
                  (IN_TRADE.includes(o.order_st_cd) &&
                    (role === 'buyer' || o.order_st_cd !== 'SELLER_DONE'))) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => act(o.order_id, 'cancel')}
                  >
                    {canceling
                      ? t(
                          role === 'buyer'
                            ? 'actionCancelingBuyer'
                            : 'actionCancelingSeller',
                        )
                      : t(
                          role === 'buyer'
                            ? 'actionCancelBuyer'
                            : 'actionCancelSeller',
                        )}
                  </Button>
                )}
              </div>

              {role === 'seller' && IN_TRADE.includes(o.order_st_cd) && (
                <p className="text-muted-foreground text-xs">
                  {t('waitingBuyerConfirm')}
                </p>
              )}
              {role === 'buyer' && o.order_st_cd === 'BUYER_DONE' && (
                <p className="text-muted-foreground text-xs">
                  {t('waitingSellerComplete')}
                </p>
              )}
              {o.order_st_cd === 'DONE' && (
                <p className="text-muted-foreground text-xs">
                  {t('escrowReleased')}
                </p>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
