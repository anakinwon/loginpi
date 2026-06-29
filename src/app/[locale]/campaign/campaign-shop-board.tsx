'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'
import { maskUsername } from '@/lib/mask-username'
import type { ShopConditionRow } from '@/app/api/campaign/shops/route'

interface ShopsResponse {
  shops: ShopConditionRow[]
  is_admin: boolean
  my_seller_id: string | null
}

const COND_KEYS: (keyof ShopConditionRow['conditions'])[] = [
  'shop',
  'item',
  'telegram',
  'tlgm_alrt',
]

const PAGE_SIZE = 20

// 마지막 수행일시 — 현지 시간대 날짜+시·분·초 (메모리: 현지 형식 표시 규칙)
function fmtLastDtm(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export function CampaignShopBoard() {
  const t = useTranslations('event.shop')
  const [rows, setRows] = useState<ShopConditionRow[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [mySellerId, setMySellerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granting, setGranting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // 조건 컬럼 레이블 — t()가 필요해 컴포넌트 내부 정의
  const condLabelMap: Record<string, string> = {
    shop: t('colM1'),
    item: t('colM2'),
    telegram: t('colM3'),
    tlgm_alrt: t('colM4'),
  }

  // q: 요원명 검색 — 서버에서 pg_trgm(.ilike)로 필터 (sql/086·101)
  const loadShops = useCallback(async (q = '') => {
    try {
      const url = q.trim()
        ? `/api/campaign/shops?q=${encodeURIComponent(q.trim())}`
        : '/api/campaign/shops'
      const res = await piFetch(url)
      if (!res.ok) throw new Error((await res.json()).error ?? 'error')
      const data = (await res.json()) as ShopsResponse
      setRows(data.shops ?? [])
      setIsAdmin(!!data.is_admin)
      setMySellerId(data.my_seller_id ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadShops()
  }, [loadShops])

  // 요원명 검색 — 입력 즉시(300ms debounce) 서버 trgm 검색
  const firstSearchRef = useRef(true)
  useEffect(() => {
    if (firstSearchRef.current) {
      firstSearchRef.current = false
      return
    }
    const id = setTimeout(() => {
      setPage(1)
      void loadShops(search)
    }, 300)
    return () => clearTimeout(id)
  }, [search, loadShops])

  // 관리자 전용: 전체 완수 매장 보상 일괄 지급
  const handleGrantAll = async () => {
    if (granting) return
    if (!window.confirm(t('boardGrantConfirm', { conds: totalConds }))) return
    setGranting(true)
    try {
      const res = await piFetch('/api/admin/campaign/grant-all', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? t('boardGrantError'))
        return
      }
      const lines = [
        t('boardGrantResultTitle'),
        t('boardGrantResultEligible', {
          conds: totalConds,
          eligible: data.eligible,
        }),
        t('boardGrantResultGranted', { granted: data.granted }),
        t('boardGrantResultAlready', { already: data.already }),
        ...(data.failed
          ? [t('boardGrantResultFailed', { failed: data.failed })]
          : []),
      ]
      alert(lines.join('\n'))
      await loadShops()
    } catch {
      alert(t('boardGrantNetworkError'))
    } finally {
      setGranting(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  if (error)
    return <p className="text-muted-foreground text-center text-sm">{error}</p>
  if (!rows.length)
    return (
      <p className="text-muted-foreground text-center text-sm">
        {t('boardEmpty')}
      </p>
    )

  const totalConds = COND_KEYS.length
  const fullCnt = rows.filter((r) =>
    Object.values(r.conditions).every(Boolean),
  ).length

  // 순위는 페이징 전에 부여(1~N 유지). rows는 route에서 완료수 desc 정렬됨.
  const filtered = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const curPage = Math.min(page, totalPages)
  const paged = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {t('boardTitle')}{' '}
          <span className="text-muted-foreground text-sm font-normal">
            (
            {t('boardStats', {
              count: rows.length,
              conds: totalConds,
              full: fullCnt,
            })}
            )
          </span>
        </h3>
        {isAdmin && (
          <button
            type="button"
            onClick={handleGrantAll}
            disabled={granting}
            title={t('boardGrantTitle', { conds: totalConds })}
            className="rounded-md border border-amber-500 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            {granting ? t('boardGranting') : t('boardGrantAll')}
          </button>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
        placeholder={t('boardSearchPlaceholder')}
        className="border-input bg-background focus:ring-primary/30 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:max-w-xs"
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th className="bg-muted sticky left-0 z-10 py-2.5 pr-3 pl-2 text-left font-semibold">
                <span className="text-muted-foreground mr-1">
                  {t('colRank')}
                </span>
                {t('colShop')}
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">
                {t('colDone')}
              </th>
              {COND_KEYS.map((k) => (
                <th
                  key={k}
                  className="px-3 py-2.5 text-center font-semibold whitespace-nowrap"
                >
                  {condLabelMap[k]}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                {t('colLastDtm')}
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">
                {t('colReward')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const doneCnt = Object.values(r.conditions).filter(Boolean).length
              const allDone = doneCnt === totalConds
              const isMe = !!mySellerId && r.seller_id === mySellerId
              return (
                <tr
                  key={r.shop_id}
                  className={[
                    'hover:bg-muted/50 border-b transition-colors',
                    allDone ? 'bg-green-50/60 dark:bg-green-950/20' : '',
                    isMe ? 'ring-primary/40 ring-2 ring-inset' : '',
                  ].join(' ')}
                >
                  <td className="bg-card sticky left-0 z-10 py-2.5 pr-3 pl-2">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 pt-0.5 font-semibold tabular-nums">
                        {r.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{r.shop_nm}</span>
                          {isMe && (
                            <span className="bg-primary/10 text-primary rounded px-1 py-0.5 text-xs font-semibold">
                              {t('myShopBadge')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {r.pi_username
                            ? `@${isAdmin ? r.pi_username : maskUsername(r.pi_username)}`
                            : '—'}
                        </div>
                        {r.shop_count > 1 && (
                          <div className="text-muted-foreground mt-0.5 text-xs">
                            {t('shopCountHint', { count: r.shop_count })}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold">
                    <span
                      className={
                        allDone
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {doneCnt}/{totalConds}
                    </span>
                  </td>
                  {COND_KEYS.map((k) => (
                    <td key={k} className="px-3 py-2.5 text-center">
                      {r.conditions[k] ? (
                        <span className="font-bold text-green-600 dark:text-green-400">
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}
                  <td className="text-muted-foreground px-3 py-2.5 text-center text-xs whitespace-nowrap">
                    {fmtLastDtm(r.last_cond_dtm)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {!allDone ? (
                      <span
                        className="text-muted-foreground inline-flex flex-col items-center gap-0.5 text-base"
                        title={t('rewardInProgress')}
                      >
                        🥺
                        <span className="text-[10px] font-medium">
                          {t('rewardInProgress')}
                        </span>
                      </span>
                    ) : r.grant_status === 'APPROVED' ? (
                      <span
                        className="inline-flex flex-col items-center gap-0.5 text-base"
                        title={t('rewardDone')}
                      >
                        ✅
                        <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                          {t('rewardDone')}
                        </span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex flex-col items-center gap-0.5 text-base"
                        title={t('rewardPending')}
                      >
                        🎁
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          {t('rewardPending')}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          {t('boardSearchEmpty')}
        </p>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t('paginationInfo', {
              count: filtered.length,
              from: (curPage - 1) * PAGE_SIZE + 1,
              to: Math.min(curPage * PAGE_SIZE, filtered.length),
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={curPage <= 1}
              className="hover:bg-muted rounded-md border px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              {t('paginationPrev')}
            </button>
            <span className="px-2 tabular-nums">
              {curPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={curPage >= totalPages}
              className="hover:bg-muted rounded-md border px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              {t('paginationNext')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
