'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'

type SettleSt = 'UNSETTLED' | 'SETTLED' | 'FAILED' | 'NO_UID' | 'DISABLED'

interface PreviewOrder {
  order_id: string
  seller_id: string
  order_price_pi: number
  ccy_cd: string | null
  ccy_amt: number | null
  reg_dtm: string
  settle_st_cd: SettleSt
  settle_dtm: string | null
  settle_err_tx: string | null
  seller_pi_username: string | null
  seller_linked: boolean
  buyer_display: string
}

interface SettledRow {
  order_id: string
  order_price_pi: number
  ccy_cd: string | null
  ccy_amt: number | null
  settle_dtm: string | null
  release_txid: string | null
  seller_pi_username: string | null
  buyer_display: string
}

interface Preview {
  a2u_enabled: boolean
  count: number
  total_pi: number
  orders: PreviewOrder[]
  settled: SettledRow[]
}

interface SettleResp {
  attempted: number
  settled: number
  results?: Array<{
    order_id: string
    result?: { status?: string; reason?: string; detail?: string }
  }>
}

const round7 = (n: number) => Math.round(n * 1e7) / 1e7

// 자국통화 표기 — 등록시점 고정 참고가 (Pi 직거래는 ccy 없음 → '—')
function fmtCcy(amt: number | null, cd: string | null): string {
  if (amt == null || !cd) return '—'
  return `${amt.toLocaleString()} ${cd}`
}

// 판매일자 — 날짜만 (관리자 브라우저 로컬 타임존)
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE')
}

// 정산일시 — 날짜+시각 (성공일자)
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('sv-SE').slice(0, 16)
}

// txid 축약 — 앞6…뒤6
function shortTxid(txid: string | null): string {
  if (!txid) return '—'
  return txid.length > 14 ? `${txid.slice(0, 6)}…${txid.slice(-6)}` : txid
}

// 정산 상태 색상·라벨키
const ST_STYLE: Record<SettleSt, string> = {
  UNSETTLED: 'text-muted-foreground',
  SETTLED: 'text-green-600 dark:text-green-400',
  FAILED: 'text-destructive',
  NO_UID: 'text-destructive',
  DISABLED: 'text-amber-600 dark:text-amber-400',
}
const ST_LABEL_KEY: Record<SettleSt, string> = {
  UNSETTLED: 'settleStUnsettled',
  SETTLED: 'settleStSettled',
  FAILED: 'settleStFailed',
  NO_UID: 'settleStNoUid',
  DISABLED: 'settleStDisabled',
}

// 미정산 판매자 정산 — 목록 미리보기(GET) → 행 선택 → 확인 클릭 시에만 실송금(POST).
// 실제 돈은 사람 클릭 때만 이동. 미연동 판매자(송금 불가)는 선택 불가로 막는다.
export function PendingSettleRunner() {
  const t = useTranslations('admin.batch')

  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  async function loadPreview() {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/store/settle')
      if (res.ok) {
        const data = (await res.json()) as Preview
        setPreview(data)
        // 기본 선택 = 송금 가능한(연동된) 주문 전체
        setSelected(
          new Set(
            data.orders.filter((o) => o.seller_linked).map((o) => o.order_id),
          ),
        )
      } else {
        toast.error(t('settleError', { msg: res.status }))
      }
    } catch {
      toast.error(t('settleError', { msg: 'network error' }))
    } finally {
      setLoading(false)
    }
  }

  function toggle(orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  function toggleAll(linkedIds: string[]) {
    setSelected((prev) =>
      prev.size === linkedIds.length ? new Set() : new Set(linkedIds),
    )
  }

  async function runSettle() {
    const orderIds = [...selected]
    if (orderIds.length === 0) return
    if (!window.confirm(t('settleConfirm', { count: orderIds.length }))) return

    setRunning(true)
    try {
      const res = await piFetch('/api/admin/store/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: orderIds }), // 선택 주문만 정산
      })
      const data = (await res.json()) as SettleResp & { error?: string }
      if (res.ok) {
        toast.success(
          t('settleResult', {
            settled: data.settled,
            attempted: data.attempted,
          }),
        )
        // 실패 건이 있으면 첫 사유를 그대로 노출 — 원인 즉시 진단
        const firstFail = data.results?.find(
          (r) => r.result?.status !== 'settled',
        )
        if (firstFail?.result) {
          const r = firstFail.result
          toast.error(`정산 실패 (${r.reason ?? 'ERROR'}): ${r.detail ?? ''}`, {
            duration: 15000,
          })
        }
        await loadPreview() // 정산 후 잔여 목록 갱신
      } else {
        toast.error(t('settleError', { msg: data.error ?? res.status }))
      }
    } catch {
      toast.error(t('settleError', { msg: 'network error' }))
    } finally {
      setRunning(false)
    }
  }

  const linkedIds = preview
    ? preview.orders.filter((o) => o.seller_linked).map((o) => o.order_id)
    : []
  const selectedTotal = preview
    ? preview.orders
        .filter((o) => selected.has(o.order_id))
        .reduce((sum, o) => sum + Number(o.order_price_pi), 0)
    : 0

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <Button onClick={loadPreview} disabled={loading} variant="outline">
        {loading ? t('settleLoading') : t('settleLoad')}
      </Button>

      {preview && (
        <div className="space-y-3">
          {!preview.a2u_enabled && (
            <div className="bg-destructive/10 text-destructive rounded-md px-4 py-2 text-sm">
              {t('settleA2uDisabled')}
            </div>
          )}

          {preview.count === 0 ? (
            <p className="text-muted-foreground text-sm">{t('settleEmpty')}</p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {t('settleSummary', {
                  count: preview.count,
                  total: round7(preview.total_pi),
                })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3 font-medium">
                        <input
                          type="checkbox"
                          aria-label={t('settleColSelect')}
                          checked={
                            linkedIds.length > 0 &&
                            selected.size === linkedIds.length
                          }
                          disabled={linkedIds.length === 0}
                          onChange={() => toggleAll(linkedIds)}
                        />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColSeller')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColBuyer')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColAmount')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColCcy')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColDate')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColStatus')}
                      </th>
                      <th className="py-2 font-medium">
                        {t('settleColLinked')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.orders.map((o) => (
                      <tr key={o.order_id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            aria-label={o.order_id}
                            checked={selected.has(o.order_id)}
                            disabled={!o.seller_linked}
                            onChange={() => toggle(o.order_id)}
                          />
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {o.seller_pi_username
                            ? `@${o.seller_pi_username}`
                            : o.seller_id.slice(0, 8)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {o.buyer_display}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {o.order_price_pi}
                        </td>
                        <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                          {fmtCcy(o.ccy_amt, o.ccy_cd)}
                        </td>
                        <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                          {fmtDate(o.reg_dtm)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={ST_STYLE[o.settle_st_cd]}>
                            {t(ST_LABEL_KEY[o.settle_st_cd])}
                          </span>
                          {o.settle_err_tx && (
                            <span
                              className="text-destructive ml-1 cursor-help"
                              title={o.settle_err_tx}
                            >
                              ⚠
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          {o.seller_linked ? (
                            <span className="text-green-600 dark:text-green-400">
                              {t('settleLinkedYes')}
                            </span>
                          ) : (
                            <span className="text-destructive">
                              {t('settleLinkedNo')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-sm font-medium">
                {t('settleSelectedSummary', {
                  count: selected.size,
                  total: round7(selectedTotal),
                })}
              </p>
              <Button
                onClick={runSettle}
                disabled={
                  running || !preview.a2u_enabled || selected.size === 0
                }
                variant="destructive"
              >
                {running ? t('settleRunning') : t('settleRun')}
              </Button>
            </>
          )}

          {/* 정산 완료 목록 — 성공일자(settle_dtm) 최신순 */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-semibold">
              {t('settledTitle')}
              {preview.settled.length > 0 && (
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {t('settledSummary', { count: preview.settled.length })}
                </span>
              )}
            </p>
            {preview.settled.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('settledEmpty')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColSeller')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColBuyer')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColAmount')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColCcy')}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t('settleColSettledAt')}
                      </th>
                      <th className="py-2 font-medium">{t('settleColTxid')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.settled.map((s) => (
                      <tr key={s.order_id} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {s.seller_pi_username
                            ? `@${s.seller_pi_username}`
                            : '—'}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {s.buyer_display}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {s.order_price_pi}
                        </td>
                        <td className="text-muted-foreground py-2 pr-3 whitespace-nowrap">
                          {fmtCcy(s.ccy_amt, s.ccy_cd)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-green-600 dark:text-green-400">
                          {fmtDateTime(s.settle_dtm)}
                        </td>
                        <td className="text-muted-foreground py-2 font-mono text-xs">
                          {s.release_txid ? (
                            <span title={s.release_txid}>
                              {shortTxid(s.release_txid)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
