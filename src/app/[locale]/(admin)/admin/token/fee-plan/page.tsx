'use client'

import { useEffect, useState } from 'react'
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

const TABS = [
  { label: '전체', value: '' },
  { label: '구독', value: 'SUBSCR' },
  { label: '카페', value: 'CAFE' },
  { label: '스토어', value: 'STORE' },
  { label: '플랫폼', value: 'PLATFORM' },
] as const

type TabValue = (typeof TABS)[number]['value']

const CYCLE_LABEL: Record<string, string> = {
  M: '월',
  Y: '년',
  W: '주',
  ONCE: '건당',
}

const GRADE_LABEL: Record<string, string> = {
  GENERAL: '일반',
  PREMIUM: '프리미엄',
  EVENT: '이벤트',
  S: 'S',
  M: 'M',
  L: 'L',
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
      .catch((e: Error) => alert(`오류: ${e.message}`))
      .finally(() => setToggling(null))
  }

  const visible = filterByTab(rows, tab)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" /> Bean 요금제 관리
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bean 경제 표준 요금 마스터 — PRD_15_FEE §4 기준 (43행).
          구독요금만 빠르게 수정하려면{' '}
          <a href="/admin/token/subscr-pricing" className="text-primary underline-offset-2 hover:underline">
            구독요금제 관리
          </a>
          를 사용하세요.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        {TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-t px-4 py-2 text-sm font-medium transition-colors ${
              tab === value
                ? 'border-primary text-primary border-b-2'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            <span className="text-muted-foreground ml-1 text-xs">
              ({filterByTab(rows, value).length})
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      )}
      {error && <p className="text-sm text-red-500">오류: {error}</p>}

      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-xs">
            {visible.length}개 요금제 표시 중 (전체 {rows.length}개)
          </p>

          <div className="overflow-hidden overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">코드</th>
                  <th className="px-3 py-2 text-left font-medium">상품 분류</th>
                  <th className="px-3 py-2 text-left font-medium">요금종류</th>
                  <th className="px-3 py-2 text-left font-medium">등급</th>
                  <th className="px-3 py-2 text-left font-medium">주기</th>
                  <th className="px-3 py-2 text-right font-medium">Bean</th>
                  <th className="px-3 py-2 text-right font-medium">Pi</th>
                  <th className="px-3 py-2 text-left font-medium">설명</th>
                  <th className="px-3 py-2 text-center font-medium">활성</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-muted-foreground px-3 py-6 text-center text-sm"
                    >
                      요금제가 없습니다
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
                          {GRADE_LABEL[row.grade_cd] ?? row.grade_cd}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {CYCLE_LABEL[row.bill_cycle_cd] ?? row.bill_cycle_cd}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {row.amt_bean === 0 ? (
                          <span className="text-muted-foreground">무료</span>
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
                              ? '활성'
                              : '비활성'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground text-xs">
            ✅ DB가 런타임 권위 소스입니다 (2026-06-24 DB화 완료). amt_bean 수정 즉시 구독 과금에 반영됩니다. use_yn 비활성화 시 해당 플랜은 구독 목록에서 제외됩니다.
          </p>
        </>
      )}
    </div>
  )
}
