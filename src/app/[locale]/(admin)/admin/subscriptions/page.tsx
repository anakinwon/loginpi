'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'

// 통계 차트는 Plotly(window 의존) 사용 — SSR 불가, dynamic + ssr:false 필수
const SubscrStatsCharts = dynamic(
  () => import('@/components/admin/subscr-stats-charts'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="bg-muted h-[352px] animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-muted h-[336px] animate-pulse rounded-lg"
            />
          ))}
        </div>
      </div>
    ),
  },
)

// p-6(48) + 제목+설명(56) + gap+추이차트(368) + gap+차트3종(352) + gap+검색(52) + gap+필터(36) + gap+테이블헤더(33) + gap+페이지(36)
const CHROME_PX = 1045

type SubscrProduct = 'PICAFE' | 'PISHOP' | 'TRANSLATE'
type SubscrGrade = 'GENERAL' | 'S' | 'M' | 'L'
type SubscrCycle = 'M' | 'Y'

interface SubscrRow {
  subscr_id: string
  prod_ctgr_cd: SubscrProduct
  grade_cd: SubscrGrade
  bill_cycle_cd: SubscrCycle
  fee_plan_cd: string
  bean_amt: number
  start_dtm: string
  expire_dtm: string
  auto_renew_yn: 'Y' | 'N' | null
  sys_user: {
    id: string
    display_name: string
    pi_username: string | null
    google_email: string | null
  } | null
}

const PRODUCT_COLOR: Record<SubscrProduct, string> = {
  PICAFE:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  PISHOP: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  TRANSLATE:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const PRODUCT_LABEL: Record<SubscrProduct, string> = {
  PICAFE: 'PiCafe',
  PISHOP: 'PiShop',
  TRANSLATE: '번역',
}

const CYCLE_LABEL: Record<SubscrCycle, string> = { M: '월간', Y: '연간' }
const GRADE_SUFFIX: Record<SubscrGrade, string> = {
  GENERAL: '',
  S: ' S',
  M: ' M',
  L: ' L',
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

// 날짜 표시는 현지 시간대 기준 시·분·초까지 (프로젝트 표준: 날짜만 표시 금지)
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR')
}

export default function SubscriptionsPage() {
  const t = useTranslations('adminSubscriptions')
  const tc = useTranslations('common')

  // allRows: 차트·전체 현황용(검색과 무관) / rows: 목록용(검색 결과 반영)
  const [allRows, setAllRows] = useState<SubscrRow[]>([])
  const [rows, setRows] = useState<SubscrRow[]>([])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SubscrProduct | 'all'>('all')
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  useEffect(() => {
    setPage(1)
  }, [limit, filter, rows])

  // 최초 전체 로드 (차트 + 목록 초기값)
  useEffect(() => {
    fetch('/api/admin/subscriptions')
      .then((r) => r.json())
      .then((d: { subscriptions: SubscrRow[] }) => {
        setAllRows(d.subscriptions ?? [])
        setRows(d.subscriptions ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  // username 검색 (debounce). 2글자 미만이면 서버 호출 없이 전체(allRows) 표시.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setRows(allRows)
      setSearching(false)
      return
    }
    setSearching(true)
    const h = setTimeout(() => {
      fetch(`/api/admin/subscriptions?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((d: { subscriptions: SubscrRow[] }) =>
          setRows(d.subscriptions ?? []),
        )
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(h)
  }, [query, allRows])

  const countOf = (product: SubscrProduct) =>
    rows.filter((r) => r.prod_ctgr_cd === product).length

  const filtered =
    filter === 'all' ? rows : rows.filter((r) => r.prod_ctgr_cd === filter)
  const totalPages = Math.ceil(filtered.length / limit)
  const displayed = filtered.slice((page - 1) * limit, page * limit)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          전체 {allRows.length}건 · PiCafe{' '}
          {allRows.filter((r) => r.prod_ctgr_cd === 'PICAFE').length}건 · PiShop{' '}
          {allRows.filter((r) => r.prod_ctgr_cd === 'PISHOP').length}건 · 번역{' '}
          {allRows.filter((r) => r.prod_ctgr_cd === 'TRANSLATE').length}건
        </p>
      </div>

      {/* 통계 차트 — 전체 데이터 기준(검색·필터 무관) */}
      {!loading && allRows.length > 0 && <SubscrStatsCharts rows={allRows} />}

      {/* username 검색 */}
      <div className="flex items-center gap-2">
        <input
          className="bg-background w-72 rounded-md border px-3 py-1.5 text-sm"
          placeholder="Pi username으로 검색 (2글자 이상)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && (
          <span className="text-muted-foreground animate-pulse text-xs">
            {tc('fetching')}
          </span>
        )}
        {query.trim().length >= 2 && !searching && (
          <span className="text-muted-foreground text-xs">
            검색결과 {rows.length}건
          </span>
        )}
      </div>

      {/* 상품군 필터 */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'PICAFE', 'PISHOP', 'TRANSLATE'] as const).map((prod) => (
          <button
            key={prod}
            onClick={() => setFilter(prod)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === prod
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {prod === 'all' ? '전체' : PRODUCT_LABEL[prod]}
            {prod !== 'all' && <span className="ml-1">({countOf(prod)})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">사용자</th>
                <th className="px-4 py-2 text-left font-medium">상품</th>
                <th className="px-4 py-2 text-left font-medium">주기</th>
                <th className="px-4 py-2 text-left font-medium">Bean</th>
                <th className="px-4 py-2 text-left font-medium">시작일시</th>
                <th className="px-4 py-2 text-left font-medium">만료일시</th>
                <th className="px-4 py-2 text-left font-medium">자동갱신</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((row) => {
                const days = daysUntil(row.expire_dtm)
                const isExpired = days < 0
                const user = row.sys_user

                return (
                  <tr
                    key={row.subscr_id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {user?.pi_username
                          ? `@${user.pi_username}`
                          : (user?.google_email ?? '—')}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {user?.display_name ?? ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRODUCT_COLOR[row.prod_ctgr_cd]}`}
                      >
                        {PRODUCT_LABEL[row.prod_ctgr_cd]}
                        {GRADE_SUFFIX[row.grade_cd]}
                      </span>
                      {row.fee_plan_cd === 'ADMIN_GRANT' && (
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          관리자
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {CYCLE_LABEL[row.bill_cycle_cd]}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {row.bean_amt > 0 ? row.bean_amt.toLocaleString() : '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {fmtDateTime(row.start_dtm)}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <p
                        className={
                          isExpired ? 'text-red-500' : 'text-foreground'
                        }
                      >
                        {fmtDateTime(row.expire_dtm)}
                      </p>
                      <p className="text-muted-foreground">
                        {isExpired ? t('expired') : t('dday', { n: days })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {row.auto_renew_yn === 'Y'
                        ? t('autoRenewYes')
                        : t('autoRenewNo')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
