'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import {
  buildGoogleMapsUrl,
  buildNaverMapUrl,
  buildKakaoMapUrl,
} from '@/lib/navigation'
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
    // 오프라인 매장 주문 상태
    | 'ORDERED'
    | 'PREPARING'
    | 'READY'
  order_mthd_cd: 'DINE_IN' | 'PICKUP' | 'DELIVERY' | null
  dlvr_addr: string | null
  cancel_reason: string | null
  reg_dtm: string
  mps_item: {
    item_nm: string
    thumbnail_url: string | null
    mps_shop: ShopInfo | null
  } | null
}

type OrderAction =
  | 'release'
  | 'complete'
  | 'cancel'
  | 'accept'
  | 'ready'
  | 'pickup'

// 오프라인 상태 라벨·스타일 (i18n 키 누락 회피 — 로컬 한글 맵)
const OFFLINE_LABEL: Partial<Record<OrderRow['order_st_cd'], string>> = {
  ORDERED: '🛒 상품주문중',
  PREPARING: '👨‍🍳 상품준비중',
  READY: '✅ 상품준비완료',
}

// 주문방법 라벨
const MTHD_LABEL: Record<string, string> = {
  DINE_IN: '🍽️ 매장이용',
  PICKUP: '🥡 픽업',
  DELIVERY: '🛵 배달',
}

// 오프라인 액션 성공 메시지
const OFFLINE_ACTION_MSG: Partial<Record<OrderAction, string>> = {
  accept: '접수했습니다 — 상품준비중',
  ready: '준비완료 처리했습니다',
  pickup: '픽업 완료 — 거래가 완료되었습니다',
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
  ORDERED:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PREPARING:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  READY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
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
    action: OrderAction
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

  async function act(orderId: string, action: OrderAction) {
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
        } else if (OFFLINE_ACTION_MSG[action]) {
          // 오프라인 액션(접수·준비완료·픽업)은 로컬 메시지
          toast.success(OFFLINE_ACTION_MSG[action]!)
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
                  {/* 오프라인 상태는 로컬 라벨, 레거시 ESCROW·SELLER_DONE은 "거래중" */}
                  {OFFLINE_LABEL[o.order_st_cd] ??
                    t(
                      `orderSt.${IN_TRADE.includes(o.order_st_cd) ? 'TRADING' : o.order_st_cd}`,
                    )}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {Number(o.order_price_pi)} π ·{' '}
                {o.order_mthd_cd && MTHD_LABEL[o.order_mthd_cd]
                  ? `${MTHD_LABEL[o.order_mthd_cd]} · `
                  : ''}
                {new Date(o.reg_dtm).toLocaleString()}
                {o.order_st_cd === 'CANCELLED' &&
                  o.cancel_reason &&
                  ` · ${o.cancel_reason}`}
              </p>
              {o.order_mthd_cd === 'DELIVERY' && o.dlvr_addr && (
                <p className="text-muted-foreground text-xs">
                  🛵 배달: {o.dlvr_addr}
                </p>
              )}

              {/* 상태별 액션 — 2단계 확인: ①수령(구매자) ②거래완료(판매자) */}
              <div className="flex flex-wrap gap-1.5">
                {/* 구매자 거래중 상태: 매장 출발하기 버튼 — 딥링크로 네이티브 지도 앱에 위임 */}
                {role === 'buyer' &&
                  IN_TRADE.includes(o.order_st_cd) &&
                  (() => {
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

                {/* 오프라인 — 판매자 주문접수 (상품주문중 → 상품준비중) */}
                {role === 'seller' && o.order_st_cd === 'ORDERED' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act(o.order_id, 'accept')}
                  >
                    📥 주문접수
                  </Button>
                )}
                {/* 오프라인 — 판매자 준비완료 (상품준비중 → 상품준비완료) */}
                {role === 'seller' && o.order_st_cd === 'PREPARING' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act(o.order_id, 'ready')}
                  >
                    ✅ 준비완료
                  </Button>
                )}
                {/* 오프라인 — 구매자 픽업 (상품준비완료 → 거래완료) */}
                {role === 'buyer' && o.order_st_cd === 'READY' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act(o.order_id, 'pickup')}
                  >
                    🥡 픽업 완료
                  </Button>
                )}
                {(o.order_st_cd === 'PENDING' ||
                  (IN_TRADE.includes(o.order_st_cd) &&
                    (role === 'buyer' || o.order_st_cd !== 'SELLER_DONE')) ||
                  // 오프라인: 상품주문중만 취소 가능(구매자 수수료/판매자 거절).
                  //          접수 후(상품준비중·준비완료)는 양측 취소 불가.
                  o.order_st_cd === 'ORDERED') && (
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
              {/* 오프라인 상태 안내 */}
              {o.order_st_cd === 'ORDERED' && (
                <p className="text-muted-foreground text-xs">
                  {role === 'seller'
                    ? '👉 접수하기를 눌러 준비를 시작하세요'
                    : '사장님 접수 대기중입니다'}
                </p>
              )}
              {o.order_st_cd === 'PREPARING' && (
                <p className="text-muted-foreground text-xs">
                  {role === 'seller'
                    ? '👉 준비가 끝나면 준비완료를 눌러주세요'
                    : '상품을 준비하고 있습니다'}
                </p>
              )}
              {o.order_st_cd === 'READY' && (
                <p className="text-muted-foreground text-xs">
                  {role === 'buyer'
                    ? '🥡 픽업하러 가세요! (10분 후 자동 거래완료)'
                    : '구매자 픽업 대기중 (10분 후 자동 거래완료)'}
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
