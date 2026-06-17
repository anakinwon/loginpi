'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { formatCcy } from '@/lib/format-ccy'
import { Button } from '@/components/ui/button'
import { SellerBondCard } from './seller-bond-card'
import { deriveTradeStatus, TRADE_ST_STYLE } from '@/lib/mps-trade-status'
import type { StoreItem } from './store-item-list'

const ST_TABS = ['ALL', 'DRAFT', 'OPEN', 'CLOSED', 'SOLD'] as const

// 내 상품 관리 (SCR-03) — 상태별 탭 + 게시/중단/삭제
// serverAuthed: 서버에서 getSessionUser()로 확인한 세션 (Google 쿠키 로그인 포함)
// usePiAuth는 Pi 로그인만 반영하므로 둘 중 하나만 있어도 인증으로 간주한다
export function ClientMyItems({
  serverAuthed = false,
}: {
  serverAuthed?: boolean
}) {
  const t = useTranslations('store')
  const locale = useLocale()
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user
  // 관리자(ADMIN/MASTER)만 전체 판매자 상품 보기 토글 노출 (서버도 isAdmin 재검증)
  const isAdminUser = user?.role === 'ADMIN' || user?.role === 'MASTER'
  const [showAll, setShowAll] = useState(false)
  const [items, setItems] = useState<StoreItem[]>([])
  const [tab, setTab] = useState<(typeof ST_TABS)[number]>('ALL')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch(
        `/api/store/items?mine=1${showAll ? '&all=1' : ''}`,
      )
      if (res.ok) {
        const data = (await res.json()) as { items: StoreItem[] }
        setItems(data.items)
      }
    } finally {
      setLoading(false)
    }
  }, [showAll])

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

  async function changeStatus(itemId: string, st: 'OPEN' | 'CLOSED') {
    const res = await piFetch(`/api/store/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_st_cd: st }),
    })
    if (res.ok) {
      toast.success(t('statusChanged'))
      void load()
    } else {
      const { error } = (await res.json()) as { error?: string }
      toast.error(error ?? t('saveFail'))
    }
  }

  async function remove(itemId: string) {
    if (!confirm(t('deleteConfirm'))) return
    const res = await piFetch(`/api/store/items/${itemId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      toast.success(t('deleteSuccess'))
      void load()
    } else {
      toast.error(t('saveFail'))
    }
  }

  const filtered =
    tab === 'ALL' ? items : items.filter((i) => i.item_st_cd === tab)

  return (
    <div className="space-y-4">
      <SellerBondCard />

      <div className="flex flex-wrap items-center gap-2">
        {ST_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === s ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {s === 'ALL' ? t('all') : t(`itemSt.${s}`)}
            <span className="ml-1">
              (
              {s === 'ALL'
                ? items.length
                : items.filter((i) => i.item_st_cd === s).length}
              )
            </span>
          </button>
        ))}
        {isAdminUser && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`ml-auto rounded-full border px-3 py-1 text-xs font-medium ${showAll ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {showAll ? '🛡️ 전체 판매자' : '🛡️ 내 상품만'}
          </button>
        )}
        <Link href="/store/my/shops" className={isAdminUser ? '' : 'ml-auto'}>
          <Button size="sm" variant="outline">
            {t('shop.manage')}
          </Button>
        </Link>
        <Link href="/store/my/items/new">
          <Button size="sm" variant="outline">
            {t('newItemP2P')}
          </Button>
        </Link>
        <Link href="/store/my/shop-items/new">
          <Button size="sm">{t('newItemShop')}</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('noItems')}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            // OPEN·SOLD는 공개 목록과 동일한 거래 상태 배지, DRAFT·CLOSED는 게시 상태 그대로
            const isPublic =
              item.item_st_cd === 'OPEN' || item.item_st_cd === 'SOLD'
            const tradeSt = deriveTradeStatus(item)
            return (
              <div
                key={item.item_id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded">
                  {item.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl">🛒</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/store/${item.item_id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {item.item_nm}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${isPublic ? TRADE_ST_STYLE[tradeSt] : 'bg-muted text-muted-foreground'}`}
                    >
                      {isPublic
                        ? t(`tradeSt.${tradeSt}`)
                        : t(`itemSt.${item.item_st_cd}`)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {/* Pi 금액 강조 — 한 단계 크게 */}
                    <span className="text-foreground text-sm font-semibold">
                      {Number(item.price_pi)} π
                    </span>
                    {/* 등록 당시 자국통화 — 판매자 본인 장부용(항상 표시) */}
                    {item.ccy_cd &&
                      item.ccy_amt != null &&
                      ` · ≈ ${formatCcy(locale, item.ccy_cd, Number(item.ccy_amt))}`}
                    {item.reg_qty !== 9999 &&
                      ` · ${t('stockLeft', { count: item.stock_qty })}`}
                    {item.trading_cnt > 0 &&
                      ` · ${t('tradingCount', { count: item.trading_cnt })}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Link href={`/store/my/items/${item.item_id}/edit`}>
                    <Button size="sm" variant="outline">
                      {t('actionEdit')}
                    </Button>
                  </Link>
                  {(item.item_st_cd === 'DRAFT' ||
                    item.item_st_cd === 'CLOSED') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeStatus(item.item_id, 'OPEN')}
                    >
                      {t('actionOpen')}
                    </Button>
                  )}
                  {item.item_st_cd === 'OPEN' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeStatus(item.item_id, 'CLOSED')}
                    >
                      {t('actionClose')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(item.item_id)}
                  >
                    {t('actionDelete')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
