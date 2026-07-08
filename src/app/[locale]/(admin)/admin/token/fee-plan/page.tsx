'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'

interface FeePlanRow {
  fee_plan_id: string
  fee_plan_cd: string
  subscr_div_cd: string
  prod_ctgr_cd: string
  fee_knd_cd: string
  grade_cd: string
  bill_cycle_cd: string
  amt_bean: number
  qty_limit: number
  fee_plan_desc: string | null
  use_yn: 'Y' | 'N'
  sort_ord: number
  mod_dtm: string
}

// 탭 값과 i18n 키 (라벨은 렌더 시 t()로 조회)
const TABS = [
  { value: '', tKey: 'common.all' },
  { value: 'SUBSCR', tKey: 'adminToken.feePlan.tab.subscr' },
  { value: 'CAFE', tKey: 'adminToken.feePlan.tab.cafe' },
  { value: 'STORE', tKey: 'adminToken.feePlan.tab.store' },
  { value: 'PLATFORM', tKey: 'adminToken.feePlan.tab.platform' },
] as const

type TabValue = (typeof TABS)[number]['value']

// 주기·등급 라벨 i18n 키 (없는 코드는 원본 표시)
const CYCLE_KEYS: Record<string, string> = {
  M: 'adminToken.feePlan.cycle.M',
  Y: 'adminToken.feePlan.cycle.Y',
  W: 'adminToken.feePlan.cycle.W',
  ONCE: 'adminToken.feePlan.cycle.ONCE',
}

const GRADE_KEYS: Record<string, string> = {
  GENERAL: 'adminToken.feePlan.grade.GENERAL',
  PREMIUM: 'adminToken.feePlan.grade.PREMIUM',
  EVENT: 'adminToken.feePlan.grade.EVENT',
}

function filterByTab(rows: FeePlanRow[], tab: TabValue): FeePlanRow[] {
  if (tab === '') return rows
  if (tab === 'SUBSCR') return rows.filter((r) => r.subscr_div_cd === 'SUBSCR')
  if (tab === 'CAFE')
    return rows.filter((r) => r.prod_ctgr_cd.startsWith('PICAFE'))
  if (tab === 'STORE')
    return rows.filter((r) => r.prod_ctgr_cd.startsWith('PISHOP'))
  if (tab === 'PLATFORM')
    return rows.filter(
      (r) =>
        !r.prod_ctgr_cd.startsWith('PICAFE') &&
        !r.prod_ctgr_cd.startsWith('PISHOP') &&
        r.prod_ctgr_cd !== 'PICAFE_SUBSCR' &&
        r.prod_ctgr_cd !== 'PISHOP_SUBSCR' &&
        !r.prod_ctgr_cd.startsWith('TRANSLATE'),
    )
  return rows
}

export default function BeanFeePlanPage() {
  const t = useTranslations()
  const [rows, setRows] = useState<FeePlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabValue>('')
  const [toggling, setToggling] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/token/fee-plan')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ data: FeePlanRow[] }>
      })
      .then((d) => setRows(d.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const toggleUseYn = (row: FeePlanRow) => {
    setToggling(row.fee_plan_id)
    const next: 'Y' | 'N' = row.use_yn === 'Y' ? 'N' : 'Y'
    fetch('/api/admin/token/fee-plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fee_plan_id: row.fee_plan_id, use_yn: next }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setRows((prev) =>
          prev.map((p) =>
            p.fee_plan_id === row.fee_plan_id ? { ...p, use_yn: next } : p,
          ),
        )
      })
      .catch((e: Error) => alert(t('adminToken.errorMsg', { msg: e.message })))
      .finally(() => setToggling(null))
  }

  const visible = filterByTab(rows, tab)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" />{' '}
          {t('adminToken.feePlan.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('adminToken.feePlan.subtitlePrefix')}{' '}
          <Link
            href="/admin/token/subscr-pricing"
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('adminToken.feePlan.subtitleLink')}
          </Link>
          {t('adminToken.feePlan.subtitleSuffix')}
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        {TABS.map(({ tKey, value }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-t px-4 py-2 text-sm font-medium transition-colors ${
              tab === value
                ? 'border-primary text-primary border-b-2'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(tKey)}
            <span className="text-muted-foreground ml-1 text-xs">
              ({filterByTab(rows, value).length})
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      )}
      {error && (
        <p className="text-sm text-red-500">
          {t('adminToken.errorMsg', { msg: error })}
        </p>
      )}

      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-xs">
            {t('adminToken.feePlan.showing', {
              visible: visible.length,
              total: rows.length,
            })}
          </p>

          <div className="overflow-hidden overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('adminToken.feePlan.colCode')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('adminToken.feePlan.colProdCtgr')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('adminToken.feePlan.colFeeKnd')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('adminToken.feePlan.colGrade')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('adminToken.feePlan.colCycle')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Bean</th>
                  <th className="px-3 py-2 text-right font-medium">Pi</th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('adminToken.feePlan.colDesc')}
                  </th>
                  <th className="px-3 py-2 text-center font-medium">
                    {t('adminToken.feePlan.colActive')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-muted-foreground px-3 py-6 text-center text-sm"
                    >
                      {t('adminToken.feePlan.noPlan')}
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => (
                    <tr
                      key={row.fee_plan_id}
                      className={`hover:bg-muted/30 transition-colors ${row.use_yn === 'N' ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs font-semibold">
                        {row.fee_plan_cd}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-xs">
                        {row.prod_ctgr_cd}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-xs">
                        {row.fee_knd_cd}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="bg-muted rounded px-1.5 py-0.5">
                          {GRADE_KEYS[row.grade_cd]
                            ? t(GRADE_KEYS[row.grade_cd])
                            : row.grade_cd}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {CYCLE_KEYS[row.bill_cycle_cd]
                          ? t(CYCLE_KEYS[row.bill_cycle_cd])
                          : row.bill_cycle_cd}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {row.amt_bean === 0 ? (
                          <span className="text-muted-foreground">
                            {t('common.free')}
                          </span>
                        ) : (
                          <>
                            <BeanIcon className="mr-0.5 inline h-3 w-3" />
                            {row.amt_bean.toLocaleString()}
                          </>
                        )}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-right text-xs tabular-nums">
                        {row.amt_bean === 0
                          ? '—'
                          : (row.amt_bean / 100).toFixed(2) + ' π'}
                      </td>
                      <td className="text-muted-foreground max-w-xs truncate px-3 py-2 text-xs">
                        {row.fee_plan_desc ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleUseYn(row)}
                          disabled={toggling === row.fee_plan_id}
                          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                            row.use_yn === 'Y'
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {toggling === row.fee_plan_id
                            ? '...'
                            : row.use_yn === 'Y'
                              ? t('adminToken.feePlan.colActive')
                              : t('adminToken.feePlan.inactive')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground text-xs">
            {t('adminToken.feePlan.footnote')}
          </p>
        </>
      )}
    </div>
  )
}
