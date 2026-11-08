'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { BeanIcon } from '@/components/ui/bean-icon'
import { piFetch } from '@/lib/pi-fetch'
import { useFeeMode } from '@/components/feature-flag-provider'

// Bean/Pi 매출 일별 시계열 (self-contained) — 메인 대시보드 매출 시계열 슬롯 교체용.
//   period prop만 받고 자체적으로 /api/admin/token/stats(=fn_bean_daily_stats)를 조회.
//   충전(발행)·소비·보상·환불 4개 흐름을 일자별 선으로.
//   ⭐활성 요금제 모드(PI/BEAN)에 따라 단위 전환 — PI 모드면 *_pi(Pi 가치, PI 거래 포함) 표시. PRD_24 §0.
//   ⚠️ Bean 시각 표기는 BeanIcon(/bean.png)만 사용 — 콩 이모지 금지(프로젝트 규칙).

interface BeanDailyRow {
  stat_dt: string // 'YYYY-MM-DD' (KST)
  charge_bean: number
  spend_bean: number
  reward_bean: number
  refund_bean: number
  charge_pi: number
  spend_pi: number
  reward_pi: number
  refund_pi: number
  txn_cnt: number
}

// Plotly는 hex 색 필요(tailwind 클래스 불가). token 대시보드 KPI 색 계열과 통일.
const FLOWS = [
  {
    beanKey: 'charge_bean',
    piKey: 'charge_pi',
    labelKey: 'beanFlowCharge',
    hex: '#22c55e',
  },
  {
    beanKey: 'spend_bean',
    piKey: 'spend_pi',
    labelKey: 'beanFlowSpend',
    hex: '#f59e0b',
  },
  {
    beanKey: 'reward_bean',
    piKey: 'reward_pi',
    labelKey: 'beanFlowReward',
    hex: '#14b8a6',
  },
  {
    beanKey: 'refund_bean',
    piKey: 'refund_pi',
    labelKey: 'beanFlowRefund',
    hex: '#f43f5e',
  },
] as const

const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#94a3b8', size: 11 },
  margin: { l: 48, r: 16, t: 10, b: 36 },
  hovermode: 'x unified' as const,
  legend: { orientation: 'h' as const, y: -0.2, x: 0 },
}
const COMMON_CONFIG = { displayModeBar: false, responsive: true } as const
const PLOT_STYLE = { width: '100%', height: '256px' }

export default function BeanRevenueTimeline({
  period = 30,
}: {
  period?: number
}) {
  const t = useTranslations('adminStats')
  const isPi = useFeeMode() === 'PI' // PI 모드면 Pi 단위(*_pi) 표시
  const [rows, setRows] = useState<BeanDailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    piFetch('/api/admin/token/stats')
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((d: { trends?: BeanDailyRow[] }) => {
        if (alive) setRows(d.trends ?? [])
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [period])

  const { data, isEmpty } = useMemo(() => {
    const sliced = period > 0 ? rows.slice(-period) : rows
    const x = sliced.map((r) => r.stat_dt)
    const unit = isPi ? 'Pi' : 'Bean'
    const fmt = isPi ? '.4f' : '' // Pi는 소수, Bean은 정수
    const traces = FLOWS.map((f) => ({
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: t(f.labelKey),
      x,
      y: sliced.map((r) => Number(r[isPi ? f.piKey : f.beanKey]) || 0),
      line: {
        color: f.hex,
        width: 2,
        shape: 'spline' as const,
        smoothing: 1.3,
      },
      marker: { color: f.hex, size: 4 },
      hovertemplate: `${t(f.labelKey)}: %{y:,${fmt}} ${unit}<extra></extra>`,
    }))
    const total = sliced.reduce(
      (s, r) =>
        s +
        (isPi
          ? r.charge_pi + r.spend_pi + r.reward_pi + r.refund_pi
          : r.charge_bean + r.spend_bean + r.reward_bean + r.refund_bean),
      0,
    )
    return { data: traces, isEmpty: sliced.length === 0 || total === 0 }
  }, [rows, period, t, isPi])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          {isPi ? (
            // PI 모드 — Pi 단위 표시
            <span>단위: π · 최근 {period}일</span>
          ) : (
            <>
              {t('beanUnitPrefix')}{' '}
              <BeanIcon className="inline-block h-3.5 w-3.5" />{' '}
              {t('beanUnitSuffix', { period })}
            </>
          )}
        </span>
        <span className="text-muted-foreground text-xs">
          {t('beanFlowsCaption')}
        </span>
      </div>
      {loading ? (
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
      ) : error ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {t('beanError')}
        </p>
      ) : isEmpty ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {t('beanEmpty')}
        </p>
      ) : (
        <PlotlyPlot
          data={data}
          layout={BASE_LAYOUT}
          config={COMMON_CONFIG}
          style={PLOT_STYLE}
          useResizeHandler
        />
      )}
    </div>
  )
}
