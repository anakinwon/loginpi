'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Txn {
  txn_id: string
  order_id: string
  txn_type_cd: string
  pi_amt: number
  txn_dtm: string
  memo: string | null
  item_nm: string | null
  order_st_cd: string | null
}

const TABS = ['ALL', 'BUY', 'SELL', 'ETC'] as const
type Tab = (typeof TABS)[number]

const BUY_TYPES = new Set(['ESCROW_IN', 'CANCEL_REFUND', 'REFUND_IN'])
const SELL_TYPES = new Set(['RELEASE_OUT', 'CANCEL_FEE_IN', 'SETTLE_OUT'])
function category(typeCd: string): Exclude<Tab, 'ALL'> {
  if (BUY_TYPES.has(typeCd)) return 'BUY'
  if (SELL_TYPES.has(typeCd)) return 'SELL'
  return 'ETC'
}

// 거래 내역 (SCR-07 / FR-12) — 구매·판매·기타 탭 + 날짜 범위 필터
export function ClientMyHistory({
  serverAuthed = false,
}: {
  serverAuthed?: boolean
}) {
  const t = useTranslations('store')
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user

  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const res = await piFetch(`/api/store/txns?${qs.toString()}`)
      if (res.ok) {
        const data = (await res.json()) as { txns: Txn[] }
        setTxns(data.txns)
      }
    } finally {
      setLoading(false)
    }
  }, [from, to])

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

  const filtered =
    tab === 'ALL' ? txns : txns.filter((x) => category(x.txn_type_cd) === tab)

  // 알 수 없는 유형 코드는 코드 자체를 라벨로 노출(키 누락 안전)
  const typeLabel = (cd: string) =>
    t.has(`history.type.${cd}`) ? t(`history.type.${cd}`) : cd

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === tb ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t(`history.tab.${tb}`)}
            <span className="ml-1">
              (
              {tb === 'ALL'
                ? txns.length
                : txns.filter((x) => category(x.txn_type_cd) === tb).length}
              )
            </span>
          </button>
        ))}
      </div>

      {/* 날짜 범위 필터 */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">
            {t('history.from')}
          </label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs">
            {t('history.to')}
          </label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        {(from || to) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            {t('history.clearFilter')}
          </Button>
        )}
      </div>

      {/* 목록 */}
      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('history.empty')}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((x) => {
            const isOut = x.pi_amt < 0
            return (
              <div
                key={x.txn_id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {x.item_nm ?? t('itemNotFound')}
                    </span>
                    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px]">
                      {typeLabel(x.txn_type_cd)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {new Date(x.txn_dtm).toLocaleString()}
                    {x.memo && ` · ${x.memo}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-sm font-semibold ${isOut ? 'text-muted-foreground' : 'text-primary'}`}
                >
                  {isOut ? '' : '+'}
                  {x.pi_amt} π
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
