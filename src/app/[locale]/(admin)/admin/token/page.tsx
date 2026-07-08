'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BeanIcon } from '@/components/ui/bean-icon'
import { TokenRevenue } from '@/components/admin/token-revenue'
import { BeanRevenueDistribution } from '@/components/admin/token-distribution'
import BeanRevenueTimeline from '@/components/admin/bean-daily-chart'

interface TokenKpi {
  total_issued_bean: number
  total_issued_pi: number
  charge_issued_bean: number
  mint_issued_bean: number
  reward_granted_bean: number
  reward_breakdown: { label: string; bean: number }[]
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

interface MonitorInfo {
  checkedAt: string
  ok: boolean
  diff: number | null
}
interface StatsResponse {
  kpi: TokenKpi
  monitor: MonitorInfo | null
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

// 보상 지급 누계 박스 — 합계 + 이벤트/캠페인별 세부 분해
function RewardBreakdownBox({ kpi }: { kpi: TokenKpi }) {
  const t = useTranslations()
  const breakdown = kpi.reward_breakdown ?? []
  return (
    <div className="mt-2 rounded-md bg-teal-50 px-2.5 py-1.5 dark:bg-teal-950/30">
      <BsRow
        label={t('adminToken.dashboard.rewardGranted')}
        bean={kpi.reward_granted_bean}
        strong
        dotColor="bg-teal-500"
      />
      {breakdown.length > 0 ? (
        <div className="mt-1 border-t border-teal-200 pt-1 dark:border-teal-800">
          {breakdown.map((item) => (
            <div
              key={item.label}
              className="flex items-baseline justify-between gap-2 py-0.5 pl-3"
            >
              <span className="text-muted-foreground text-xs">
                {item.label}
              </span>
              <span className="text-xs font-medium tabular-nums">
                {item.bean.toLocaleString()}
                <span className="text-muted-foreground ml-1">
                  ≈ π{(item.bean / 100).toFixed(2)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t('adminToken.dashboard.noRewardTxn')}
        </p>
      )}
      <p className="text-muted-foreground mt-1 text-xs">
        {t('adminToken.dashboard.rewardNote')}
      </p>
    </div>
  )
}

// Bean 대차대조표 — 차변(발행) = 대변(유통 + 회수)
function BalanceSheet({
  kpi,
  monitor,
}: {
  kpi: TokenKpi
  monitor?: MonitorInfo | null
}) {
  const t = useTranslations()
  const debit = kpi.total_issued_bean // 차변: 발행 원천
  const credit = kpi.circulating_bean + kpi.total_collected_bean // 대변: 현재 소재
  const diff = debit - credit // Bean 정수 항등식 — 정상이면 반드시 정확히 0
  const balanced = diff === 0 // 무관용원칙: ±1도 허용 안 함 (1 Bean 누수도 누수)

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      {/* 헤더 */}
      <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-semibold">
          {t('adminToken.dashboard.balanceSheet')}
        </p>
        {balanced ? (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
            {t('adminToken.dashboard.balanced')}
          </span>
        ) : (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {t('adminToken.dashboard.unbalanced', {
              diff: `${diff > 0 ? '+' : ''}${diff.toLocaleString()}`,
            })}
          </span>
        )}
      </div>

      {/* T 계정: 차변 | 대변 (모바일 세로 / md 이상 2열) */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x">
        {/* ── 차변 (좌변) ── */}
        <div className="border-b px-4 py-3 md:border-b-0">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            {t('adminToken.dashboard.debitHeader')}
          </p>
          <BsRow
            label={t('adminToken.dashboard.totalIssued')}
            bean={kpi.total_issued_bean}
            strong
            dotColor="bg-blue-500"
          />
          <div className="mt-1.5 border-t pt-1.5">
            <BsRow
              label={t('adminToken.dashboard.chargeIssued')}
              bean={kpi.charge_issued_bean}
              indent
              dotColor="bg-blue-400"
            />
            <BsRow
              label={t('adminToken.dashboard.mintIssued')}
              bean={kpi.mint_issued_bean}
              indent
              dotColor="bg-teal-400"
            />
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {t('adminToken.dashboard.debitNote')}
          </p>
          {/* 보상 지급 누계 (REWARD) — 이벤트/캠페인별 세부 분해 */}
          <RewardBreakdownBox kpi={kpi} />
        </div>

        {/* ── 대변 (우변) ── */}
        <div className="px-4 py-3">
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            {t('adminToken.dashboard.creditHeader')}
          </p>
          <BsRow
            label={t('adminToken.dashboard.circulating')}
            bean={kpi.circulating_bean}
            strong
            dotColor="bg-green-500"
          />
          <div className="mt-1.5 border-t pt-1.5">
            <BsRow
              label={t('adminToken.dashboard.collectedSubtotal')}
              bean={kpi.total_collected_bean}
              strong
              dotColor="bg-amber-500"
            />
            <BsRow
              label={t('adminToken.dashboard.platformOps')}
              bean={kpi.platform_balance_bean}
              indent
              dotColor="bg-purple-400"
            />
            <BsRow
              label={t('adminToken.dashboard.rewardPoolEco')}
              bean={kpi.reward_pool_balance_bean}
              indent
              dotColor="bg-teal-400"
            />
            <BsRow
              label={t('adminToken.dashboard.foundationOrg')}
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
          <span className="text-sm font-bold">
            {t('adminToken.dashboard.debitTotal')}
          </span>
          <span className="text-base font-bold tabular-nums">
            {debit.toLocaleString()}
          </span>
        </div>
        <div
          className={`flex items-baseline justify-between px-4 py-2.5 ${balanced ? 'bg-muted/30' : 'bg-red-50 dark:bg-red-950/20'}`}
        >
          <span className="text-sm font-bold">
            {t('adminToken.dashboard.creditTotal')}
          </span>
          <span
            className={`text-base font-bold tabular-nums ${balanced ? '' : 'text-red-600 dark:text-red-400'}`}
          >
            {credit.toLocaleString()}
          </span>
        </div>
      </div>
      {monitor && (
        <div className="text-muted-foreground border-t px-4 py-2 text-xs">
          {t('adminToken.dashboard.autoCheck')}{' '}
          <span
            className={
              monitor.ok
                ? 'text-green-600 dark:text-green-400'
                : 'font-semibold text-red-600 dark:text-red-400'
            }
          >
            {monitor.ok
              ? t('adminToken.dashboard.checkOk')
              : t('adminToken.dashboard.unbalanced', {
                  diff: String(monitor.diff ?? '?'),
                })}
          </span>{' '}
          · {new Date(monitor.checkedAt).toLocaleString('ko-KR')}
        </div>
      )}
    </div>
  )
}

export default function TokenAdminPage() {
  const t = useTranslations()
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
            <BeanIcon className="inline-block h-6 w-6" />{' '}
            {t('adminToken.dashboard.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('adminToken.dashboard.subtitle')}{' '}
            <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
          </p>
        </div>
        {data && (
          <p className="text-muted-foreground text-xs">
            {t('adminToken.dashboard.updatedAt', {
              date: new Date(data.last_updated).toLocaleString('ko-KR'),
            })}
          </p>
        )}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">
          {t('adminToken.dashboard.aggregating')}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-500">
          {t('adminToken.errorMsg', { msg: error })}
        </p>
      )}

      {kpi && (
        <>
          {/* 항등식 검증 배너 */}
          {!kpi.identity_ok && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400">
              {t('adminToken.dashboard.identityMismatch', {
                issued: kpi.total_issued_bean,
                circulating: kpi.circulating_bean,
                collected: kpi.total_collected_bean,
              })}
            </div>
          )}

          {/* Bean 대차대조표 (차변 = 대변) — 메인 */}
          <BalanceSheet kpi={kpi} monitor={data?.monitor} />

          {/* 매출 분석 — Pi 현금 + Bean 회수 항목별 */}
          <TokenRevenue />

          {/* 일별 시계열 — 최근 30일 충전·소비·보상·환불 흐름 */}
          <BeanRevenueTimeline period={30} />

          {/* 거래 유형별 분포 — 매출에 없는 충전·보상·전송까지 활동 전반 */}
          <BeanRevenueDistribution period={30} />

          {/* 공급량 KPI 3종 */}
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              {t('adminToken.dashboard.supplyStatus')}
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <KpiCard
                label={t('adminToken.dashboard.totalIssued')}
                bean={kpi.total_issued_bean}
                sub={t('adminToken.dashboard.chargeTotalSub')}
                accent="blue"
              />
              <KpiCard
                label={t('adminToken.dashboard.circulatingCard')}
                bean={kpi.circulating_bean}
                sub={t('adminToken.dashboard.circulatingCardSub')}
                accent="green"
              />
              <KpiCard
                label={t('adminToken.dashboard.totalCollected')}
                bean={kpi.total_collected_bean}
                sub={t('adminToken.dashboard.collectionRateSub', {
                  rate: kpi.collection_rate_percent.toFixed(1),
                })}
                accent="amber"
              />
            </div>
          </div>

          {/* 거버넌스 지갑 3종 — Pi Network 공식 기준 */}
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              {t('adminToken.dashboard.govWallets')}
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <KpiCard
                label={t('adminToken.dashboard.platformRevenue')}
                bean={kpi.platform_balance_bean}
                sub={t('adminToken.dashboard.platformRevenueSub')}
                accent="purple"
                badge={`${kpi.platform_pct.toFixed(1)}%`}
              />
              <KpiCard
                label={t('adminToken.dashboard.foundationReserve')}
                bean={kpi.foundation_balance_bean}
                sub={t('adminToken.dashboard.foundationReserveSub')}
                accent="rose"
                badge={`${kpi.foundation_pct.toFixed(1)}%`}
              />
              <KpiCard
                label={t('adminToken.dashboard.rewardPoolFund')}
                bean={kpi.reward_pool_balance_bean}
                sub={t('adminToken.dashboard.rewardPoolFundSub')}
                accent="teal"
                badge={`${kpi.reward_pool_pct.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* 배분 정책 안내 */}
          <p className="text-muted-foreground text-xs">
            {t('adminToken.dashboard.distributionPolicy')}
          </p>
        </>
      )}
    </div>
  )
}
