'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'

interface OrderRow {
  order_id: string
  item_id: string
  buyer_id: string
  seller_id: string
  order_price_pi: number
  order_st_cd: 'PENDING' | 'ESCROW' | 'TRADING' | 'SELLER_DONE' | 'DONE' | 'CANCELLED'
  cancel_reason: string | null
  reg_dtm: string
  mps_item: { item_nm: string; thumbnail_url: string | null } | null
}

const ST_STYLE: Record<OrderRow['order_st_cd'], string> = {
  PENDING:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  ESCROW:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  TRADING:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  SELLER_DONE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  DONE:        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED:   'bg-muted text-muted-foreground',
}

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
  const [acting, setActing] = useState<string | null>(null)

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
    return <p className='text-muted-foreground py-16 text-center text-sm'>{t('loading')}</p>
  }
  if (!authed) {
    return <p className='text-muted-foreground py-16 text-center text-sm'>{t('loginRequired')}</p>
  }

  async function act(orderId: string, action: 'confirm' | 'release' | 'cancel') {
    let body: string | undefined
    if (action === 'cancel') {
      const reason = prompt(t('cancelReasonPrompt'))
      if (!reason?.trim()) return
      body = JSON.stringify({ reason: reason.trim() })
    }
    setActing(orderId)
    try {
      const res = await piFetch(`/api/store/orders/${orderId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      })
      if (res.ok) {
        toast.success(t(`actionDone.${action}`))
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
    <div className='space-y-3'>
      {loading ? (
        <p className='text-muted-foreground py-16 text-center text-sm'>{t('loading')}</p>
      ) : orders.length === 0 ? (
        <p className='text-muted-foreground py-16 text-center text-sm'>{t('noOrders')}</p>
      ) : (
        orders.map(o => {
          const busy = acting === o.order_id
          return (
            <div key={o.order_id} className='space-y-2 rounded-lg border p-4'>
              <div className='flex items-center justify-between gap-2'>
                <Link href={`/store/${o.item_id}`} className='truncate text-sm font-medium hover:underline'>
                  {o.mps_item?.item_nm ?? t('itemNotFound')}
                </Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ST_STYLE[o.order_st_cd]}`}>
                  {t(`orderSt.${o.order_st_cd}`)}
                </span>
              </div>
              <p className='text-muted-foreground text-xs'>
                {Number(o.order_price_pi)} π · {new Date(o.reg_dtm).toLocaleString()}
                {o.order_st_cd === 'CANCELLED' && o.cancel_reason && ` · ${o.cancel_reason}`}
              </p>

              {/* 상태별 액션 — 양방향 확인 (FR-11) */}
              <div className='flex flex-wrap gap-1.5'>
                {role === 'seller' && (o.order_st_cd === 'ESCROW' || o.order_st_cd === 'TRADING') && (
                  <Button size='sm' disabled={busy} onClick={() => act(o.order_id, 'confirm')}>
                    {t('actionSellerDone')}
                  </Button>
                )}
                {role === 'buyer' && o.order_st_cd === 'SELLER_DONE' && (
                  <Button size='sm' disabled={busy} onClick={() => act(o.order_id, 'release')}>
                    {t('actionBuyerDone')}
                  </Button>
                )}
                {role === 'buyer' && o.order_st_cd === 'SELLER_DONE' && (
                  <Button size='sm' variant='outline' disabled={busy} onClick={() => act(o.order_id, 'cancel')}>
                    {t('actionCancel')}
                  </Button>
                )}
                {['PENDING', 'ESCROW', 'TRADING'].includes(o.order_st_cd) && (
                  <Button size='sm' variant='outline' disabled={busy} onClick={() => act(o.order_id, 'cancel')}>
                    {t('actionCancel')}
                  </Button>
                )}
              </div>

              {role === 'seller' && o.order_st_cd === 'SELLER_DONE' && (
                <p className='text-muted-foreground text-xs'>{t('waitingBuyerConfirm')}</p>
              )}
              {o.order_st_cd === 'DONE' && (
                <p className='text-muted-foreground text-xs'>{t('escrowReleased')}</p>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
