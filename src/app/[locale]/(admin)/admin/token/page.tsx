'use client'

import { useEffect, useState } from 'react'
import { BeanIcon } from '@/components/ui/bean-icon'
import { TokenRevenue } from '@/components/admin/token-revenue'

interface TokenKpi {
  total_issued_bean: number
  total_issued_pi: number
  circulating_bean: number
  circulating_pi: number
  total_collected_bean: number
  total_collected_pi: number
  collection_rate_percent: number
  platform_balance_bean: number
  foundation_balance_bean: number
  reward_pool_balance_bean: number
  platform_pct: number
  foundation_pct: number
  reward_pool_pct: number
  identity_ok: boolean
}

interface StatsResponse {
  kpi: TokenKpi
  last_updated: string
}

type Accent = 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'teal'

function KpiCard({
  label,
  bean,
  sub,
  accent,
  badge,
}: {
  label: string
  bean: number
  sub?: string
  accent?: Accent
  badge?: string
}) {
  const colors: Record<Accent, string> = {
    blue: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
    green:
      'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30',
    amber:
      'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
    purple:
      'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30',
    rose: 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
    teal: 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30',
  }
  return (
    <div
      className={`rounded-lg border p-4 ${accent ? colors[accent] : 'border-border bg-card'}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        {badge && (
          <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs font-semibold dark:bg-white/10">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums">
        <BeanIcon className="inline-block h-5 w-5" /> {bean.toLocaleString()}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">
        ≈ π {(bean / 100).toFixed(2)}
      </p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
    </div>
  )
}

// 대차대조표 한 줄 (라벨 + Bean + π 환산)
function BsRow({
  label,
  bean,
  indent,
  strong,
  dotColor,
}: {
  label: string
  bean: number
  indent?: boolean
  strong?: boolean
  dotColor?: string
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${indent ? 'pl-4' : ''}`}
    >
      <span
        className={`flex items-center gap-1.5 text-sm ${strong ? 'font-semibold' : 'text-muted-foreground'}`}
      >
        {dotColor && (
          <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        )}
        {label}
      </span>
      <span className="text-right">
        <span
          className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm font-medium'}`}
        >
          {bean.toLocaleString()}
        </span>
        <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
          ≈ π{(bean / 100).toFixed(2)}
        </span>
      </span>
    </div>
  )
}

// Bean 대차대조표 — 차변(발행) = 대변(유통 + 회수)
function BalanceSheet({ kpi }: { kpi: TokenKpi }) {
  const debit = kpi.total_issued_bean // 차변: 발행 원천
  const credit = kpi.circulating_bean + kpi.total_collected_bean // 대변: 현재 소재
  const diff = debit - credit // 0이면 균형
  const balanced = Math.abs(diff) <= 1

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      {/* 헤더 */}
      <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-semibold">Bean 대차대조표</p>
        {balanced ? (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
            ✓ 균형 (차변 = 대변)
          </span>
        ) : (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
            ✗ 불일치 diff {diff > 0 ? '+' : ''}
            {diff.toLocaleString()}
          </span>
        )}
      </div>

      {/* T 계정: 차변 | 대변 (모바일 세로 / md 이상 2열) */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x">
        {/* ── 차변 (좌변) ── */}
        <div className="border-b px-4 py-3 md:border-b-0">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            차변 (발행 — 원천)
          </p>
          <BsRow
            label="총 발행량"
            bean={kpi.total_issued_bean}
            strong
            dotColor="bg-blue-500"
          />
          <p className="text-muted-foreground mt-0.5 text-xs">
            전체 CHARGE 합계 — Pi 충전으로 발행된 Bean 총량
          </p>
        </div>

        {/* ── 대변 (우변) ── */}
        <div className="px-4 py-3">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            대변 (소재 — 유통 + 회수)
          </p>
          <BsRow
            label="유통 (사용자 보유)"
            bean={kpi.circulating_bean}
            strong
            dotColor="bg-green-500"
          />
          <div className="mt-1.5 border-t pt-1.5">
            <BsRow
              label="회수 소계 (거버넌스)"
              bean={kpi.total_collected_bean}
              strong
              dotColor="bg-amber-500"
            />
            <BsRow
              label="PLATFORM 운영"
              bean={kpi.platform_balance_bean}
              indent
              dotColor="bg-purple-400"
            />
            <BsRow
              label="REWARD_POOL 생태계"
              bean={kpi.reward_pool_balance_bean}
              indent
              dotColor="bg-teal-400"
            />
            <BsRow
              label="FOUNDATION 재단"
              bean={kpi.foundation_balance_bean}
              indent
              dotColor="bg-rose-400"
            />
          </div>
        </div>
      </div>

      {/* 합계 행 (차변 합계 = 대변 합계) */}
      <div className="grid grid-cols-1 border-t md:grid-cols-2 md:divide-x">
        <div className="bg-muted/30 flex items-baseline justify-between border-b px-4 py-2.5 md:border-b-0">
          <span className="text-sm font-bold">차변 합계</span>
          <span className="text-base font-bold tabular-nums">
            {debit.toLocaleString()}
          </span>
        </div>
        <div
          className={`flex items-baseline justify-between px-4 py-2.5 ${balanced ? 'bg-muted/30' : 'bg-red-50 dark:bg-red-950/20'}`}
        >
          <span className="text-sm font-bold">대변 합계</span>
          <span
            className={`text-base font-bold tabular-nums ${balanced ? '' : 'text-red-600 dark:text-red-400'}`}
          >
            {credit.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function TokenAdminPage() {
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/token/stats')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<StatsResponse>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const kpi = data?.kpi

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BeanIcon className="inline-block h-6 w-6" /> Bean 경제 대시보드
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            PRD_16_TOKEN_MNG v1.3 — Pi Network 기준 거버넌스 · 소각 없음 · 1π =
            100{' '}
            <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
          </p>
        </div>
        {data && (
          <p className="text-muted-foreground text-xs">
            갱신: {new Date(data.last_updated).toLocaleString('ko-KR')}
          </p>
        )}
      </div>

      {loading && <p className="text-muted-foreground text-sm">집계 중...</p>}
      {error && <p className="text-sm text-red-500">오류: {error}</p>}

      {kpi && (
        <>
          {/* 항등식 검증 배너 */}
          {!kpi.identity_ok && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400">
              ⚠️ Bean 항등식 불일치 — 발행({kpi.total_issued_bean}) ≠ 유통(
              {kpi.circulating_bean}) + 회수({kpi.total_collected_bean}). DB
              점검 필요.
            </div>
          )}

          {/* Bean 대차대조표 (차변 = 대변) — 메인 */}
          <BalanceSheet kpi={kpi} />

          {/* 매출 분석 — Pi 현금 + Bean 회수 항목별 */}
          <TokenRevenue />

          {/* 공급량 KPI 3종 */}
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              공급량 현황
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <KpiCard
                label="총 발행량"
                bean={kpi.total_issued_bean}
                sub="전체 CHARGE 합계"
                accent="blue"
              />
              <KpiCard
                label="유통 중"
                bean={kpi.circulating_bean}
                sub="USER 지갑 합계"
                accent="green"
              />
              <KpiCard
                label="총 회수"
                bean={kpi.total_collected_bean}
                sub={`회수율 ${kpi.collection_rate_percent.toFixed(1)}%`}
                accent="amber"
              />
            </div>
          </div>

          {/* 거버넌스 지갑 3종 — Pi Network 공식 기준 */}
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              거버넌스 지갑 (Pi Network 공식 기준)
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <KpiCard
                label="PLATFORM 운영 수익"
                bean={kpi.platform_balance_bean}
                sub="소비 회수분 70%"
                accent="purple"
                badge={`${kpi.platform_pct.toFixed(1)}%`}
              />
              <KpiCard
                label="FOUNDATION 재단 적립금"
                bean={kpi.foundation_balance_bean}
                sub="소비 회수분 10% · Pi Network 기준"
                accent="rose"
                badge={`${kpi.foundation_pct.toFixed(1)}%`}
              />
              <KpiCard
                label="REWARD_POOL 생태계 기금"
                bean={kpi.reward_pool_balance_bean}
                sub="소비 회수분 20% · Pi Network 기준"
                accent="teal"
                badge={`${kpi.reward_pool_pct.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* 배분 정책 안내 */}
          <p className="text-muted-foreground text-xs">
            소비(SPEND/SUBSCRIBE/TIP/FEE) 회수분 배분: 운영 70% → PLATFORM ·
            생태계 20% → REWARD_POOL · 재단 10% → FOUNDATION · 환불(REFUND)은
            동일 비율로 역차감
          </p>
        </>
      )}
    </div>
  )
}
