'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'

interface MonitorData {
  payment: {
    completed_cnt: number
    pending_cnt: number
    stuck_cnt: number
    success_rate: number | string
    avg_dur_sec: number | string
  }
  orders: {
    waiting_cnt: number
    processing_cnt: number
    done_1h_cnt: number
    cancelled_cnt: number
  }
  concurrent: { today_active: number }
  api: { sample_cnt: number; p95_ms: number; error_rate: number }
  system: {
    rss_mb: number
    heap_used_mb: number
    heap_total_mb: number
    heap_pct: number
    cpu_total_ms: number
    uptime_s: number
  }
  ts: string
}

const REFRESH_MS = 5000
const HISTORY_MAX = 24 // 스파크라인 점 개수 (약 2분)
// Vercel 함수 메모리 추정 한계(기본 1GB) — RSS 점유율 참고용(정확 limit는 런타임 미노출)
const ASSUMED_LIMIT_MB = 1024

// 경량 스파크라인 (최근 N점 → SVG polyline). Plotly보다 가벼워 실시간 폴링에 적합.
function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  if (data.length < 2) return <div className="h-8" />
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100
      const y = 28 - ((v - min) / range) * 26
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}

// 결제 신호등: 미완료>5건 또는 성공률<95% = 위험, <99% = 경고, 그 외 정상
// 한글 라벨은 컴포넌트 내부에서 t()로 매핑 (여기선 상태 키만 반환)
function payLight(
  rate: number,
  stuck: number,
): { cls: string; key: 'danger' | 'warn' | 'ok' } {
  if (stuck > 5 || rate < 95) return { cls: 'bg-red-500', key: 'danger' }
  if (rate < 99) return { cls: 'bg-amber-500', key: 'warn' }
  return { cls: 'bg-green-500', key: 'ok' }
}

function Card({
  title,
  children,
  accent,
}: {
  title: string
  children: React.ReactNode
  accent?: boolean
}) {
  return (
    <div
      className={`shadow-soft rounded-xl border p-4 ${accent ? 'ring-primary ring-2' : ''}`}
    >
      <p className="text-muted-foreground mb-2 text-xs font-medium">{title}</p>
      {children}
    </div>
  )
}

export function MonitorDashboard() {
  const t = useTranslations('adminOps')
  const [data, setData] = useState<MonitorData | null>(null)
  const [err, setErr] = useState(false)
  const [lastOk, setLastOk] = useState<string>('')
  // 클라이언트 누적 시계열 (스파크라인용)
  const [memHist, setMemHist] = useState<number[]>([])
  const [cpuHist, setCpuHist] = useState<number[]>([])
  // CPU 사용률 = 누적 CPU시간 델타 / 실시간 델타 (인스턴스 변경 시 음수 → 0으로 clamp)
  const prevCpu = useRef<{ totalMs: number; at: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await piFetch('/api/admin/monitor')
      if (r.ok) {
        const d = (await r.json()) as MonitorData
        setData(d)
        setErr(false)
        setLastOk(new Date().toLocaleTimeString('ko-KR'))
        // 메모리 시계열 누적 — RSS(실제 점유) 추세 (heap%는 항상 높아 추세 무의미)
        setMemHist((h) => [...h, d.system.rss_mb].slice(-HISTORY_MAX))
        // CPU 사용률 계산 (델타 기반)
        const now = Date.now()
        const prev = prevCpu.current
        if (prev) {
          const cpuDelta = d.system.cpu_total_ms - prev.totalMs
          const timeDelta = now - prev.at
          const pct =
            timeDelta > 0 && cpuDelta >= 0
              ? Math.min(100, Math.round((1000 * cpuDelta) / timeDelta) / 10)
              : 0
          setCpuHist((h) => [...h, pct].slice(-HISTORY_MAX))
        }
        prevCpu.current = { totalMs: d.system.cpu_total_ms, at: now }
      } else {
        setErr(true)
      }
    } catch {
      setErr(true)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  if (!data) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {err ? t('monitor.loadFail') : t('monitor.fetching')}
      </p>
    )
  }

  const rate = Number(data.payment.success_rate)
  const avgDur = Number(data.payment.avg_dur_sec)
  const light = payLight(rate, data.payment.stuck_cnt)
  const lightLabels: Record<typeof light.key, string> = {
    danger: t('monitor.lightDanger'),
    warn: t('monitor.lightWarn'),
    ok: t('monitor.lightOk'),
  }

  return (
    <div className="space-y-4">
      {/* 상태 바 */}
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {err
            ? t('monitor.refreshFail')
            : t('monitor.refreshedAt', { time: lastOk })}{' '}
          · {t('monitor.autoInterval', { sec: REFRESH_MS / 1000 })}
        </span>
        <span>
          {t('monitor.activeToday', { n: data.concurrent.today_active })}
        </span>
      </div>

      {/* Pi 결제 — 최우선 강조 카드 */}
      <Card title={t('monitor.paySuccessTitle')} accent>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-bold">{rate.toFixed(1)}%</span>
          <span
            className={`mb-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${light.cls}`}
          >
            {lightLabels[light.key]}
          </span>
        </div>
        <div className="text-muted-foreground mt-2 grid grid-cols-3 gap-2 text-xs">
          <span>
            {t('monitor.payCompleted', { n: data.payment.completed_cnt })}
          </span>
          <span>
            {t('monitor.payPending', { n: data.payment.pending_cnt })}
          </span>
          <span
            className={
              data.payment.stuck_cnt > 0 ? 'text-red-600 dark:text-red-400' : ''
            }
          >
            {t('monitor.payStuck', { n: data.payment.stuck_cnt })}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('monitor.avgProcess', { sec: avgDur })}
        </p>
        {data.payment.stuck_cnt > 5 && (
          <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {t('monitor.stuckWarn', { n: data.payment.stuck_cnt })}
          </p>
        )}
      </Card>

      {/* 나머지 메트릭 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title={t('monitor.ordersTitle')}>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <span>{t('monitor.ordersWaiting')}</span>
            <span className="text-right font-semibold">
              {data.orders.waiting_cnt}
            </span>
            <span>{t('monitor.ordersProcessing')}</span>
            <span className="text-right font-semibold">
              {data.orders.processing_cnt}
            </span>
            <span>{t('monitor.ordersDone1h')}</span>
            <span className="text-right font-semibold">
              {data.orders.done_1h_cnt}
            </span>
            <span>{t('monitor.ordersCancelled24h')}</span>
            <span className="text-right font-semibold">
              {data.orders.cancelled_cnt}
            </span>
          </div>
        </Card>

        <Card title={t('monitor.concurrentTitle')}>
          <p className="text-3xl font-bold">{data.concurrent.today_active}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('monitor.concurrentDesc')}
          </p>
        </Card>

        <Card title={t('monitor.apiTitle')}>
          {data.api.sample_cnt > 0 ? (
            <div className="space-y-1 text-sm">
              <p>
                {t('monitor.apiP95')}{' '}
                <span className="font-semibold">{data.api.p95_ms}ms</span>
              </p>
              <p>
                {t('monitor.apiErrorRate')}{' '}
                <span className="font-semibold">{data.api.error_rate}%</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {t('monitor.apiSample', { n: data.api.sample_cnt })}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t('monitor.apiWaiting')}
              <br />
              <span className="text-xs">{t('monitor.apiWaitingHint')}</span>
            </p>
          )}
        </Card>
      </div>

      {/* 시스템 리소스 — 메모리·CPU 시계열 (현재 함수 인스턴스 기준) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title={t('monitor.memTitle')}>
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold">{data.system.rss_mb}MB</span>
            <span
              className={`mb-1 text-xs ${data.system.rss_mb / ASSUMED_LIMIT_MB > 0.85 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
            >
              {t('monitor.memVsLimit', {
                pct: Math.round((100 * data.system.rss_mb) / ASSUMED_LIMIT_MB),
              })}
            </span>
          </div>
          <Sparkline data={memHist} stroke="var(--chart-1)" />
          <p className="text-muted-foreground mt-1 text-xs">
            {t('monitor.heapInfo', {
              used: data.system.heap_used_mb,
              total: data.system.heap_total_mb,
              pct: data.system.heap_pct,
            })}
          </p>
        </Card>

        <Card title={t('monitor.cpuTitle')}>
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold">
              {cpuHist.length ? `${cpuHist[cpuHist.length - 1]}%` : '—'}
            </span>
            <span className="text-muted-foreground mb-1 text-xs">
              {t('monitor.instanceUptime', {
                min: Math.floor(data.system.uptime_s / 60),
              })}
            </span>
          </div>
          <Sparkline data={cpuHist} stroke="var(--chart-4)" />
        </Card>
      </div>

      <p className="text-muted-foreground text-center text-xs">
        {t.rich('monitor.footerNote', { b: (c) => <b>{c}</b> })}
      </p>
    </div>
  )
}
