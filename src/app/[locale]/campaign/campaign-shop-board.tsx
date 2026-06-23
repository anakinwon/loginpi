'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'
import type { ShopConditionRow } from '@/app/api/campaign/shops/route'

interface ShopsResponse {
  shops: ShopConditionRow[]
  is_admin: boolean
  my_seller_id: string | null
}

const COND_LABELS: { key: keyof ShopConditionRow['conditions']; label: string }[] = [
  { key: 'shop', label: '매장 가입' },
  { key: 'item', label: '상품 등록' },
  { key: 'telegram', label: '텔레그램' },
]

const GRANT_BADGE: Record<
  NonNullable<ShopConditionRow['grant_status']>,
  { text: string; cls: string }
> = {
  PENDING: {
    text: '⏳ 대기',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  APPROVED: {
    text: '✅ 승인',
    cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  },
  REJECTED: {
    text: '✗ 거절',
    cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  },
}

export function CampaignShopBoard() {
  const [rows, setRows] = useState<ShopConditionRow[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [mySellerId, setMySellerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    piFetch('/api/campaign/shops')
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? '오류')
        const data = (await res.json()) as ShopsResponse
        setRows(data.shops ?? [])
        setIsAdmin(!!data.is_admin)
        setMySellerId(data.my_seller_id ?? null)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

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
        등록된 매장이 없습니다
      </p>
    )

  const totalConds = COND_LABELS.length
  const fullCnt = rows.filter(
    (r) => Object.values(r.conditions).every(Boolean),
  ).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          참여 매장 현황{' '}
          <span className="text-muted-foreground text-sm font-normal">
            ({rows.length}개 · 3조건 완료{' '}
            <span className="text-primary font-semibold">{fullCnt}</span>개)
          </span>
        </h3>
        {isAdmin && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
            관리자
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th className="bg-muted sticky left-0 z-10 px-3 py-2.5 text-left font-semibold">
                매장명
              </th>
              {COND_LABELS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2.5 text-center font-semibold whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold">완료</th>
              <th className="px-3 py-2.5 text-center font-semibold">신청</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const doneCnt = Object.values(r.conditions).filter(Boolean).length
              const allDone = doneCnt === totalConds
              const isMe = !!mySellerId && r.seller_id === mySellerId
              return (
                <tr
                  key={r.shop_id}
                  className={[
                    'hover:bg-muted/50 border-b transition-colors',
                    allDone ? 'bg-green-50/60 dark:bg-green-950/20' : '',
                    isMe ? 'ring-primary/40 ring-inset ring-2' : '',
                  ].join(' ')}
                >
                  {/* 매장명 + 판매자 */}
                  <td className="bg-card sticky left-0 z-10 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{r.shop_nm}</span>
                      {isMe && (
                        <span className="bg-primary/10 text-primary rounded px-1 py-0.5 text-xs font-semibold">
                          내 매장
                        </span>
                      )}
                    </div>
                    {r.pi_username && (
                      <div className="text-muted-foreground text-xs">
                        @{r.pi_username}
                      </div>
                    )}
                  </td>

                  {/* 조건별 ✓ / ✗ */}
                  {COND_LABELS.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 text-center">
                      {r.conditions[c.key] ? (
                        <span className="font-bold text-green-600 dark:text-green-400">
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}

                  {/* 완료 카운트 */}
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

                  {/* 신청 상태 */}
                  <td className="px-3 py-2.5 text-center">
                    {r.grant_status ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${GRANT_BADGE[r.grant_status].cls}`}
                      >
                        {GRANT_BADGE[r.grant_status].text}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
