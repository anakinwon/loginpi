'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

// 로그성 테이블 모니터·정리 화면.
// Vercel 서버리스라 운영서버에 로그 '파일'은 없다 → DB 로그 테이블의 행수·용량을 보고,
// 순수 운영 로그(PURGEABLE)만 기간 기준으로 물리 정리한다. 회계·감사 로그는 조회 전용.

// 용량 사용량 그래프는 Plotly(window 의존) 사용 — SSR 불가, dynamic + ssr:false 필수
const LogUsageChart = dynamic(
  () => import('@/components/admin/log-usage-chart'),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-48 animate-pulse rounded-lg" />,
  },
)

// 인프라 할당(Vercel·DB) 사용량 도넛 — 자체 fetch, Plotly 사용으로 동일하게 dynamic
const UsageQuotaSection = dynamic(
  () => import('@/components/admin/usage-quota-section'),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-48 animate-pulse rounded-lg" />,
  },
)

interface LogTable {
  tbl: string
  label: string
  category: 'PURGEABLE' | 'READONLY'
  ts_col: string
  def_days: number | null
  row_cnt: number | null
  total_bytes: number | null
  size_pretty: string | null
  oldest_dtm: string | null
  newest_dtm: string | null
  exists_yn: boolean
}

const CATEGORY_STYLE: Record<LogTable['category'], string> = {
  PURGEABLE:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  READONLY: 'bg-muted text-muted-foreground',
}

function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ko-KR') : '—'
}

function fmtNum(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('ko-KR')
}

export default function LogsPage() {
  const t = useTranslations('admin.logs')
  const tc = useTranslations('common')

  const [tables, setTables] = useState<LogTable[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<Record<string, number>>({}) // 테이블별 보존일 입력
  const [confirmTbl, setConfirmTbl] = useState<string | null>(null) // 인라인 확인 대기
  const [busyTbl, setBusyTbl] = useState<string | null>(null) // 정리 진행 중
  const [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null) // 조회 실패 사유
  const [thresholdMB, setThresholdMB] = useState(50) // 용량 임계치(MB)

  // loading 초기값이 true라 첫 로드 시 별도 토글 불필요. 재조회는 busyTbl로 진행표시.
  const load = useCallback(() => {
    fetch('/api/admin/logs')
      .then(async (r) => {
        const d = await r.json()
        // GET 실패(예: RPC 미적용)를 조용히 삼키지 않고 화면에 노출
        if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
        return d as { tables?: LogTable[] }
      })
      .then((d) => {
        const rows = d.tables ?? []
        setTables(rows)
        setLoadError(null)
        // 보존일 입력 기본값 = 권장 보존일(def_days)
        setDays((prev) => {
          const next = { ...prev }
          for (const row of rows) {
            if (next[row.tbl] == null && row.def_days != null)
              next[row.tbl] = row.def_days
          }
          return next
        })
      })
      .catch((e: unknown) => {
        setTables([])
        setLoadError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function purge(row: LogTable) {
    const d = days[row.tbl]
    setBusyTbl(row.tbl)
    setConfirmTbl(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/logs/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: row.tbl, days: d }),
      })
      const json = await res.json()
      if (!res.ok) {
        setNotice(t('purgeFail', { label: row.label, msg: json.error ?? '' }))
      } else {
        setNotice(
          t('purgeDone', { label: row.label, count: json.deleted ?? 0 }),
        )
        load()
      }
    } catch {
      setNotice(t('purgeFail', { label: row.label, msg: 'network' }))
    } finally {
      setBusyTbl(null)
    }
  }

  // 요약 — 전체 용량·행수 합계(존재하는 테이블만)
  const totalBytes = tables.reduce((s, r) => s + (r.total_bytes ?? 0), 0)
  const totalRows = tables.reduce((s, r) => s + (r.row_cnt ?? 0), 0)
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2)

  // 임계치(MB) 초과 테이블 수 — 그래프 위 경고 표시용
  const overCount = tables.filter(
    (r) => r.exists_yn && (r.total_bytes ?? 0) / (1024 * 1024) > thresholdMB,
  ).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      {/* 환경 안내 — 파일 로그 오해 방지 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900/40 dark:bg-blue-900/20">
        <p className="text-blue-800 dark:text-blue-300">{t('vercelNote')}</p>
      </div>

      {/* 인프라 할당(Vercel·Supabase DB) 사용량 도넛 */}
      <UsageQuotaSection />

      {/* 요약 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{t('totalSize')}</p>
          <p className="text-2xl font-bold">
            {loading ? '…' : `${totalMB} MB`}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{t('totalRows')}</p>
          <p className="text-2xl font-bold">
            {loading ? '…' : fmtNum(totalRows)}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/40 dark:bg-red-900/20">
          <p className="font-medium text-red-700 dark:text-red-400">
            {t('loadFailed')}
          </p>
          <p className="mt-1 font-mono text-xs text-red-600 dark:text-red-400">
            {loadError}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('loadFailedHint')}
          </p>
        </div>
      )}

      {/* 용량 사용량 + 임계치 그래프 */}
      {!loading && !loadError && tables.length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('usageTitle')}</p>
            <div className="flex items-center gap-2">
              <label className="text-muted-foreground text-xs">
                {t('thresholdLabel')}
              </label>
              <input
                type="number"
                min={1}
                value={thresholdMB}
                onChange={(e) =>
                  setThresholdMB(Math.max(1, Number(e.target.value) || 1))
                }
                className="border-input bg-background h-8 w-20 rounded-md border px-2 text-sm tabular-nums"
              />
              <span className="text-muted-foreground text-xs">MB</span>
            </div>
          </div>
          {overCount > 0 && (
            <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
              {t('overThreshold', { count: overCount })}
            </p>
          )}
          <LogUsageChart
            tables={tables}
            thresholdMB={thresholdMB}
            emptyText={t('usageEmpty')}
          />
        </div>
      )}

      {notice && (
        <div className="bg-muted rounded-md px-4 py-2 text-sm">{notice}</div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.kind')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.category')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('col.rows')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('col.size')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.range')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.action')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tables.map((row) => {
                const purgeable =
                  row.category === 'PURGEABLE' &&
                  row.exists_yn &&
                  (row.row_cnt ?? 0) > 0
                return (
                  <tr
                    key={row.tbl}
                    className="hover:bg-muted/30 align-top transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.label}</p>
                      <p className="text-muted-foreground font-mono text-xs">
                        {row.tbl}
                        {!row.exists_yn && ` · ${t('notCreated')}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLE[row.category]}`}
                      >
                        {row.category === 'PURGEABLE'
                          ? t('purgeable')
                          : t('readonly')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNum(row.row_cnt)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.size_pretty ?? '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {row.oldest_dtm ? (
                        <>
                          {fmtDateTime(row.oldest_dtm)}
                          <br />~ {fmtDateTime(row.newest_dtm)}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.category === 'READONLY' ? (
                        <span className="text-muted-foreground text-xs">
                          {t('readonlyHint')}
                        </span>
                      ) : !purgeable ? (
                        <span className="text-muted-foreground text-xs">
                          {t('nothingToPurge')}
                        </span>
                      ) : confirmTbl === row.tbl ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {t('confirmPurge', { days: days[row.tbl] })}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => purge(row)}
                              className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              {t('confirmDelete')}
                            </button>
                            <button
                              onClick={() => setConfirmTbl(null)}
                              className="border-border hover:bg-muted rounded-md border px-3 py-1 text-xs"
                            >
                              {tc('cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={7}
                            value={days[row.tbl] ?? ''}
                            onChange={(e) =>
                              setDays((p) => ({
                                ...p,
                                [row.tbl]: Number(e.target.value),
                              }))
                            }
                            className="border-input bg-background h-8 w-20 rounded-md border px-2 text-sm tabular-nums"
                          />
                          <span className="text-muted-foreground text-xs">
                            {t('daysAgo')}
                          </span>
                          <button
                            disabled={busyTbl === row.tbl}
                            onClick={() => setConfirmTbl(row.tbl)}
                            className="border-border hover:bg-muted rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50"
                          >
                            {busyTbl === row.tbl ? tc('fetching') : t('purge')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
