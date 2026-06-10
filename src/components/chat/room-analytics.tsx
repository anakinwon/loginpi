'use client'
import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import PlotlyPlot from '@/components/charts/plotly-plot'
import { piFetch } from '@/lib/pi-fetch'

// TASK-073: 채팅방 분석 대시보드 (Business 전용)
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
    <div className='rounded-xl border p-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-1 text-lg font-bold'>{value}</p>
    </div>
  )
}

export function RoomAnalytics({ roomId }: { roomId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [days, setDays] = useState<number>(30)
  const [error, setError] = useState<string | null>(null)
  const [businessRequired, setBusinessRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/analytics?days=${d}`)
      const json = (await res.json()) as AnalyticsData & { error?: string; businessRequired?: boolean }
      if (!res.ok) {
        setBusinessRequired(!!json.businessRequired)
        setError(json.error ?? '분석 조회 실패')
        setData(null)
        return
      }
      setData(json)
    } catch {
      setError('분석 조회 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => { void load(days) }, [load, days])

  if (loading) {
    return <div className='mx-auto max-w-3xl space-y-4 px-4 py-8'>
      <div className='h-8 w-48 animate-pulse rounded-lg bg-muted' />
      <div className='h-64 animate-pulse rounded-xl bg-muted' />
    </div>
  }

  if (error) {
    return (
      <div className='mx-auto max-w-3xl px-4 py-16 text-center'>
        <p className='text-3xl'>{businessRequired ? '💼' : '🔒'}</p>
        <p className='mt-3 text-sm text-muted-foreground'>{error}</p>
        {businessRequired && (
          <p className='mt-2 text-xs text-muted-foreground'>
            Business 플랜(Pi Host)으로 업그레이드하면 채팅방 분석을 볼 수 있습니다.
          </p>
        )}
        <Link href={`/chat/${roomId}`} className='mt-4 inline-block text-sm text-primary underline'>
          채팅방으로 돌아가기
        </Link>
      </div>
    )
  }

  if (!data) return null

  const dates = data.daily.map(r => r.stat_dt)

  return (
    <div className='mx-auto max-w-3xl px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-bold'>📊 채팅방 분석</h1>
          <p className='text-xs text-muted-foreground'>Business 전용 — 최근 {data.days}일</p>
        </div>
        <div className='flex items-center gap-2'>
          <div className='flex gap-1'>
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  days === p ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {p}일
              </button>
            ))}
          </div>
          <Link href={`/chat/${roomId}`} className='text-sm text-muted-foreground hover:text-foreground'>✕</Link>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className='mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <SummaryCard label={`MAU (${data.days}일 활성)`} value={`${data.summary.mau}명`} />
        <SummaryCard label='현재 멤버' value={`${data.summary.cur_mbr_cnt}명`} />
        <SummaryCard label='총 메시지' value={`${data.summary.total_msg_cnt}건`} />
        <SummaryCard label='Pi Tip 수익' value={`π${data.summary.total_tip_pi}`} />
      </div>

      {/* 메시지·활성 사용자 추이 */}
      <div className='mb-6 rounded-xl border p-3'>
        <h2 className='mb-2 text-sm font-semibold'>메시지 · 활성 사용자 추이</h2>
        <PlotlyPlot
          data={[
            {
              x: dates,
              y: data.daily.map(r => r.msg_cnt),
              type: 'scatter',
              mode: 'lines+markers',
              name: '메시지',
              line: { color: '#6366f1' },
            },
            {
              x: dates,
              y: data.daily.map(r => r.active_usr_cnt),
              type: 'scatter',
              mode: 'lines+markers',
              name: '활성 사용자',
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
      <div className='rounded-xl border p-3'>
        <h2 className='mb-2 text-sm font-semibold'>Pi Tip 수익 · 신규 멤버</h2>
        <PlotlyPlot
          data={[
            {
              x: dates,
              y: data.daily.map(r => r.tip_amt_pi),
              type: 'bar',
              name: 'Tip (π)',
              marker: { color: '#f59e0b' },
            },
            {
              x: dates,
              y: data.daily.map(r => r.new_mbr_cnt),
              type: 'bar',
              name: '신규 멤버',
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
