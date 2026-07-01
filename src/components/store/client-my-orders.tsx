'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link, useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import {
  buildGoogleMapsUrl,
  buildNaverMapUrl,
  buildKakaoMapUrl,
} from '@/lib/navigation'
import type { ShopLocation } from '@/lib/navigation'
import { WriteFeedbackButton } from '@/components/feedback/WriteFeedbackButton'

interface ShopInfo {
  shop_nm: string | null
  addr: string | null
  latd_crd: number | null
  lngt_crd: number | null
  place_id: string | null
  // 매장주 이용후기·Bean 보상 동의 여부 — 'Y'일 때만 후기 작성 버튼 노출
  fbck_consent_yn: string | null
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
    ctgr_id: string | null
    mps_shop: ShopInfo | null
  } | null
  // 카트 주문 라인(다중상품) — 단건 주문은 빈 배열/null
  lines?:
    | {
        ord_qty: number
        price_pi: number
        item: { item_nm: string } | null
      }[]
    | null
  // 주문자 정보(판매 관리 전용) — 준비완료 호명용
  buyer?: {
    nick_nm: string | null
    display_name: string | null
    pi_username: string | null
  } | null
  has_feedback?: boolean
  // 매장주(seller) 보증금 충분 여부 — 'Y'/true일 때만 후기 작성 버튼 활성 (PRD_24 §10-7)
  bond_ok?: boolean
}

// 주문자 표시명 — 별명 우선, 없으면 Pi username, 없으면 display_name
function buyerName(b: OrderRow['buyer']): string {
  return b?.nick_nm || b?.pi_username || b?.display_name || '구매자'
}

type OrderAction =
  | 'release'
  | 'complete'
  | 'cancel'
  | 'accept'
  | 'ready'
  | 'pickup'

// 오프라인 상태 라벨 (i18n 키 누락 회피 — 로컬 한글 맵)
// 주문중 → 준비중 → 상품대기중 → (5분 후) 판매완료
// DONE은 오프라인일 때만 '판매완료'로 표시 (renderCard에서 분기, 직거래는 거래완료 유지)
const OFFLINE_LABEL: Partial<Record<OrderRow['order_st_cd'], string>> = {
  ORDERED: '🛒 주문중',
  PREPARING: '👨‍🍳 준비중',
  READY: '📦 상품대기중',
}

// 주문방법 라벨
const MTHD_LABEL: Record<string, string> = {
  DINE_IN: '🍽️ 매장이용',
  PICKUP: '🥡 픽업',
  DELIVERY: '🛵 배달',
}

// 오프라인 액션 성공 메시지
const OFFLINE_ACTION_MSG: Partial<Record<OrderAction, string>> = {
  accept: '상품접수 완료 — 준비중',
  ready: '상품완료 — 수령 대기중 (5분 후 자동 판매완료)',
  pickup: '상품 수령 완료 — 거래가 완료되었습니다',
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
  feeMode = 'BEAN',
}: {
  role: 'buyer' | 'seller'
  serverAuthed?: boolean
  // 요금제 모드 — BEAN 모드에선 후기(Bean 보상) 영역 통째 숨김. 부모 server page가 getActiveFeeMode()로 주입.
  feeMode?: 'BEAN' | 'PI'
}) {
  const t = useTranslations('store')
  const router = useRouter()
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user
  // 관리자(ADMIN/MASTER)만 전체 주문 보기 토글 노출 (서버도 isAdmin 재검증)
  const isAdminUser = user?.role === 'ADMIN' || user?.role === 'MASTER'
  const [showAll, setShowAll] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<{
    id: string
    action: OrderAction
  } | null>(null)
  const [contactingId, setContactingId] = useState<string | null>(null)

  // 상대방(판매자↔구매자)에게 1:1 문의 — 기존 Direct Room API 재사용(멱등) → 채팅방 이동.
  //   P2P 직거래엔 연락 수단이 없어(당근 앱 푸시 부재) 거래 당사자 소통의 핵심 경로.
  async function contactPeer(targetUsrId: string, orderId: string) {
    setContactingId(orderId)
    try {
      const res = await piFetch('/api/chat/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_usr_id: targetUsrId }),
      })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? t('contactFail'))
      }
      const { room } = (await res.json()) as { room: { room_id: string } }
      router.push(`/chat/${room.room_id}`)
    } catch (e) {
      setContactingId(null)
      toast.error(e instanceof Error ? e.message : t('contactFail'))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch(
        `/api/store/orders?role=${role}${showAll ? '&all=1' : ''}`,
      )
      if (res.ok) {
        const data = (await res.json()) as { orders: OrderRow[] }
        setOrders(data.orders)
      }
    } finally {
      setLoading(false)
    }
  }, [role, showAll])

  useEffect(() => {
    if (authed) void load()
  }, [authed, load])

  // 판매 관리 진입 시 안읽은 주문 알림 읽음 처리 — StoreNav 뱃지 클리어(Pull 안전망)
  useEffect(() => {
    if (authed && role === 'seller') {
      void piFetch('/api/store/notifications', { method: 'POST' }).catch(
        () => {},
      )
    }
  }, [authed, role])

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
      // role 동봉 — 판매관리(seller)/구매관리(buyer)에서 취소한 역할 (수수료 당사자 구분)
      body = JSON.stringify({ reason: reason.trim(), role })
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

  // 오프라인 매장 주문 vs 직거래 — 상품의 매장 소속(mps_shop) 유무로 구분
  const isOffline = (o: OrderRow) => o.mps_item?.mps_shop != null
  const offlineOrders = orders.filter(isOffline)
  const directOrders = orders.filter((o) => !isOffline(o))
  const offlineLabel =
    role === 'seller' ? '🏪 오프라인 매장 판매' : '🏪 오프라인 매장 구매'
  const directLabel = role === 'seller' ? '🔄 직거래 판매' : '🔄 직거래 구매'

  const renderCard = (o: OrderRow) => {
    const busy = acting?.id === o.order_id
    // 취소 진행 중 여부 — 동일 주문의 수령/완료 액션과 구분해 "취소중"만 정확히 표시
    const canceling = busy && acting?.action === 'cancel'
    const offline = isOffline(o)
    // 상태 배지 라벨 — 오프라인 신규상태는 로컬 라벨, 오프라인 DONE은 역할별 분기,
    // 그 외(직거래·레거시)는 i18n (ESCROW·SELLER_DONE은 거래중으로 통합)
    const stLabel =
      OFFLINE_LABEL[o.order_st_cd] ??
      (offline && o.order_st_cd === 'DONE'
        ? role === 'buyer'
          ? '🎉 구매완료'
          : '🎉 판매완료'
        : t(
            `orderSt.${IN_TRADE.includes(o.order_st_cd) ? 'TRADING' : o.order_st_cd}`,
          ))
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
            {stLabel}
          </span>
        </div>

        {/* 판매자: 주문자(호명용) / 구매자: 픽업 매장명 */}
        {role === 'seller' && o.buyer && (
          <p className="text-sm font-semibold">
            🙋 주문자: {buyerName(o.buyer)}
          </p>
        )}
        {role === 'buyer' && o.mps_item?.mps_shop?.shop_nm && (
          <p className="text-sm font-semibold">
            🏪 {o.mps_item.mps_shop.shop_nm}
          </p>
        )}

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

        {/* 카트 주문 라인 — 개별 상품명·수량(판매자 준비용). 단건 주문은 표시 안 함 */}
        {o.lines && o.lines.length > 0 && (
          <ul
            className={`space-y-1 rounded-md px-3 py-2 text-sm ring-1 ${
              role === 'seller'
                ? 'bg-amber-50 ring-amber-200/70 dark:bg-amber-950/40 dark:ring-amber-900/50'
                : 'bg-emerald-50 ring-emerald-200/70 dark:bg-emerald-950/40 dark:ring-emerald-900/50'
            }`}
          >
            {o.lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {l.item?.item_nm ?? t('itemNotFound')}
                </span>
                <span
                  className={`shrink-0 font-semibold ${
                    role === 'seller'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  × {l.ord_qty}
                </span>
              </li>
            ))}
          </ul>
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

          {/* 오프라인 — 판매자 상품접수 (주문중 → 준비중) */}
          {role === 'seller' && o.order_st_cd === 'ORDERED' && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => act(o.order_id, 'accept')}
            >
              📥 상품접수
            </Button>
          )}
          {/* 오프라인 — 판매자 상품완료 (준비중 → 상품대기중) */}
          {role === 'seller' && o.order_st_cd === 'PREPARING' && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => act(o.order_id, 'ready')}
            >
              📦 상품완료
            </Button>
          )}
          {/* 오프라인 — 구매자 상품수령 (상품대기중 → 거래완료 + 즉시 정산 송금).
              미수령 시 5분 후 자동 판매완료(cron)가 안전망. markPickup이 release_txid 멱등이라 중복 안전 */}
          {role === 'buyer' && o.order_st_cd === 'READY' && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => act(o.order_id, 'pickup')}
            >
              📦 상품수령
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
              ? '👉 상품접수를 눌러 준비를 시작하세요'
              : '사장님 접수 대기중입니다'}
          </p>
        )}
        {o.order_st_cd === 'PREPARING' && (
          <p className="text-muted-foreground text-xs">
            {role === 'seller'
              ? '👉 준비가 끝나면 상품완료를 눌러주세요'
              : '상품을 준비하고 있습니다'}
          </p>
        )}
        {o.order_st_cd === 'READY' &&
          (role === 'buyer' ? (
            <p className="text-muted-foreground text-xs">
              📦 상품이 준비됐어요! 받으셨으면 「상품수령」을 눌러 거래를
              완료하세요 (미수령 시 5분 후 자동 판매완료)
            </p>
          ) : (
            // 준비완료 → 판매자가 주문자 호명 (요건)
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              📣 {buyerName(o.buyer)}님 호명 — 수령 대기중 (5분 후 자동
              판매완료)
            </p>
          ))}
        {o.order_st_cd === 'DONE' && (
          <p className="text-muted-foreground text-xs">{t('escrowReleased')}</p>
        )}

        {/* 구매 완료 주문 — 후기 작성 버튼 또는 완료 배지.
            매장주가 이용후기·Bean 보상에 동의(fbck_consent_yn='Y')한 매장 상품만 노출.
            BEAN 모드에선 후기 보상 자체가 비활성이므로 영역 전체 숨김(PI 모드만 노출). */}
        {feeMode === 'PI' &&
          role === 'buyer' &&
          (o.order_st_cd === 'DONE' || o.order_st_cd === 'BUYER_DONE') &&
          o.mps_item?.ctgr_id &&
          o.mps_item?.mps_shop?.fbck_consent_yn === 'Y' && (
            <div className="flex justify-end pt-1">
              {o.has_feedback ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  ✓ 후기 작성완료
                </span>
              ) : o.bond_ok ? (
                <WriteFeedbackButton orderId={o.order_id} />
              ) : (
                // 매장주 보증금 미충족 — 버튼 비활성(보상 재원 준비 시 자동 활성)
                <span
                  className="text-muted-foreground inline-flex cursor-not-allowed items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium opacity-60"
                  title="이 매장은 현재 후기 보상을 지급할 수 없어 후기 작성이 일시 중지되었습니다"
                >
                  ⭐ 후기 작성 (보상 준비중)
                </span>
              )}
            </div>
          )}

        {/* 판매자↔구매자 1:1 문의 — P2P 직거래(매장 없음)만·취소 주문 제외 */}
        {o.mps_item?.mps_shop == null && o.order_st_cd !== 'CANCELLED' && (
          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={contactingId === o.order_id}
              onClick={() =>
                contactPeer(
                  role === 'seller' ? o.buyer_id : o.seller_id,
                  o.order_id,
                )
              }
            >
              💬{' '}
              {contactingId === o.order_id
                ? t('contactStarting')
                : role === 'seller'
                  ? t('contactBuyer')
                  : t('contactSeller')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {isAdminUser && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${showAll ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {showAll
              ? role === 'seller'
                ? '🛡️ 전체 판매주문'
                : '🛡️ 전체 구매주문'
              : '🛡️ 내 주문만'}
          </button>
        )}
        {/* Pi Browser는 당겨서 새로고침이 없어 명시적 버튼 필수 — load() 재조회 */}
        <button
          onClick={() => void load()}
          disabled={loading}
          aria-label="새로고침"
          className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50"
        >
          <span className={`inline-block ${loading ? 'animate-spin' : ''}`}>
            🔄
          </span>
          {loading ? '새로고침 중…' : '새로고침'}
        </button>
      </div>
      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('noOrders')}
        </p>
      ) : (
        <div className="space-y-5">
          {offlineOrders.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold">
                {offlineLabel} ({offlineOrders.length})
              </h2>
              {offlineOrders.map(renderCard)}
            </section>
          )}
          {directOrders.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold">
                {directLabel} ({directOrders.length})
              </h2>
              {directOrders.map(renderCard)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
