'use client'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { piFetch } from '@/lib/pi-fetch'

// TASK-073: 카페 분석 대시보드 (Business 전용)
// 인증·권한은 API가 강제 — Pi Browser X-Pi-Token 이중 경로는 piFetch가 자동 처리

interface DailyRow {
  stat_dt: string
  msg_cnt: number
  active_usr_cnt: number
  tip_amt_pi: number
  new_mbr_cnt: number
}

interface AnalyticsData {
  days: number
  daily: DailyRow[]
  summary: {
    mau: number
    cur_mbr_cnt: number
    total_msg_cnt: number
    total_tip_pi: number
    total_new_mbr_cnt: number
  }
}

const PERIODS = [7, 30, 90] as const

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}

export function RoomAnalytics({ roomId }: { roomId: string }) {
  const t = useTranslations('chat')
  const tc = useTranslations('common')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [days, setDays] = useState<number>(30)
  const [error, setError] = useState<string | null>(null)
  const [businessRequired, setBusinessRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (d: number) => {
      setLoading(true)
      setError(null)
      try {
        const res = await piFetch(
          `/api/chat/rooms/${roomId}/analytics?days=${d}`,
        )
        const json = (await res.json()) as AnalyticsData & {
          error?: string
          businessRequired?: boolean
        }
        if (!res.ok) {
          setBusinessRequired(!!json.businessRequired)
          setError(json.error ?? t('analytics.fetchFail'))
          setData(null)
          return
        }
        setData(json)
      } catch {
        setError(t('analytics.fetchError'))
      } finally {
        setLoading(false)
      }
    },
    [roomId, t],
  )

  useEffect(() => {
    void load(days)
  }, [load, days])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-3xl">{businessRequired ? '💼' : '🔒'}</p>
        <p className="text-muted-foreground mt-3 text-sm">{error}</p>
        {businessRequired && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('analytics.businessOnly')}
          </p>
        )}
        <Link
          href={`/chat/${roomId}`}
          className="text-primary mt-4 inline-block text-sm underline"
        >
          {t('analytics.backToRoom')}
        </Link>
      </div>
    )
  }

  if (!data) return null

  const dates = data.daily.map((r) => r.stat_dt)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('analytics.title')}</h1>
          <p className="text-muted-foreground text-xs">
            {t('analytics.businessSubtitle', { days: data.days })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  days === p
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {tc('days', { count: p })}
              </button>
            ))}
          </div>
          <Link
            href={`/chat/${roomId}`}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </Link>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label={t('analytics.mau', { days: data.days })}
          value={tc('countPerson', { count: data.summary.mau })}
        />
        <SummaryCard
          label={t('analytics.curMembers')}
          value={tc('countPerson', { count: data.summary.cur_mbr_cnt })}
        />
        <SummaryCard
          label={t('analytics.totalMessages')}
          value={tc('count', { count: data.summary.total_msg_cnt })}
        />
        <SummaryCard
          label={t('analytics.beanRevenue')}
          value={`π${data.summary.total_tip_pi}`}
        />
      </div>

      {/* 메시지·활성 사용자 추이 */}
      <div className="mb-6 rounded-xl border p-3">
        <h2 className="mb-2 text-sm font-semibold">
          {t('analytics.trendTitle')}
        </h2>
        <PlotlyPlot
          data={[
            {
              x: dates,
              y: data.daily.map((r) => r.msg_cnt),
              type: 'scatter',
              mode: 'lines+markers',
              name: t('analytics.messages'),
              line: { color: '#6366f1' },
            },
            {
              x: dates,
              y: data.daily.map((r) => r.active_usr_cnt),
              type: 'scatter',
              mode: 'lines+markers',
              name: t('analytics.activeUsers'),
              line: { color: '#10b981' },
            },
          ]}
          layout={{
            autosize: true,
            height: 280,
            margin: { l: 40, r: 16, t: 8, b: 40 },
            legend: { orientation: 'h', y: -0.2 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
          useResizeHandler
        />
      </div>

      {/* Pi 수익 · 신규 멤버 */}
      <div className="rounded-xl border p-3">
        <h2 className="mb-2 text-sm font-semibold">
          {t('analytics.revenueTitle')}
        </h2>
        <PlotlyPlot
          data={[
            {
              x: dates,
              y: data.daily.map((r) => r.tip_amt_pi),
              type: 'bar',
              name: 'Bean (π)',
              marker: { color: '#f59e0b' },
            },
            {
              x: dates,
              y: data.daily.map((r) => r.new_mbr_cnt),
              type: 'bar',
              name: t('analytics.newMembers'),
              marker: { color: '#3b82f6' },
            },
          ]}
          layout={{
            autosize: true,
            height: 280,
            barmode: 'group',
            margin: { l: 40, r: 16, t: 8, b: 40 },
            legend: { orientation: 'h', y: -0.2 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  )
}
