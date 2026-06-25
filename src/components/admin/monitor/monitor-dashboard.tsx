'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
function payLight(rate: number, stuck: number): { cls: string; label: string } {
  if (stuck > 5 || rate < 95) return { cls: 'bg-red-500', label: '🔴 위험' }
  if (rate < 99) return { cls: 'bg-amber-500', label: '🟡 주의' }
  return { cls: 'bg-green-500', label: '🟢 정상' }
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
        // 메모리 시계열 누적
        setMemHist((h) => [...h, d.system.heap_pct].slice(-HISTORY_MAX))
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
        {err ? '데이터를 불러오지 못했습니다' : '불러오는 중…'}
      </p>
    )
  }

  const rate = Number(data.payment.success_rate)
  const avgDur = Number(data.payment.avg_dur_sec)
  const light = payLight(rate, data.payment.stuck_cnt)

  return (
    <div className="space-y-4">
      {/* 상태 바 */}
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {err ? '⚠️ 갱신 실패 — 재시도 중' : `최근 갱신 ${lastOk}`} · {REFRESH_MS / 1000}초 자동
        </span>
        <span>활동 사용자(오늘) {data.concurrent.today_active}명</span>
      </div>

      {/* Pi 결제 — 최우선 강조 카드 */}
      <Card title="⭐ Pi 결제 성공률 (최근 24h)" accent>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-bold">{rate.toFixed(1)}%</span>
          <span
            className={`mb-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${light.cls}`}
          >
            {light.label}
          </span>
        </div>
        <div className="text-muted-foreground mt-2 grid grid-cols-3 gap-2 text-xs">
          <span>완료 {data.payment.completed_cnt}</span>
          <span>진행 {data.payment.pending_cnt}</span>
          <span className={data.payment.stuck_cnt > 0 ? 'text-red-600 dark:text-red-400' : ''}>
            미완료 {data.payment.stuck_cnt}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">평균 처리 {avgDur}초</p>
        {data.payment.stuck_cnt > 5 && (
          <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            ⚠️ 미완료 결제 {data.payment.stuck_cnt}건 — 확인 필요
          </p>
        )}
      </Card>

      {/* 나머지 메트릭 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="🛒 진행 중 주문 (MPS)">
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <span>대기</span>
            <span className="text-right font-semibold">{data.orders.waiting_cnt}</span>
            <span>처리 중</span>
            <span className="text-right font-semibold">{data.orders.processing_cnt}</span>
            <span>완료(1h)</span>
            <span className="text-right font-semibold">{data.orders.done_1h_cnt}</span>
            <span>취소(24h)</span>
            <span className="text-right font-semibold">{data.orders.cancelled_cnt}</span>
          </div>
        </Card>

        <Card title="👥 동시 접속(근사)">
          <p className="text-3xl font-bold">{data.concurrent.today_active}</p>
          <p className="text-muted-foreground mt-1 text-xs">오늘 활동 사용자 수</p>
        </Card>

        <Card title="⚡ API 성능 (최근 1h)">
          {data.api.sample_cnt > 0 ? (
            <div className="space-y-1 text-sm">
              <p>
                p95 응답 <span className="font-semibold">{data.api.p95_ms}ms</span>
              </p>
              <p>
                에러율 <span className="font-semibold">{data.api.error_rate}%</span>
              </p>
              <p className="text-muted-foreground text-xs">표본 {data.api.sample_cnt}건</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              계측 수집 대기 중
              <br />
              <span className="text-xs">(요청 계측 연결 후 표시)</span>
            </p>
          )}
        </Card>
      </div>

      {/* 시스템 리소스 — 메모리·CPU 시계열 (현재 함수 인스턴스 기준) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="🧠 메모리 (heap 사용률)">
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold">{data.system.heap_pct}%</span>
            <span className="text-muted-foreground mb-1 text-xs">
              {data.system.heap_used_mb} / {data.system.heap_total_mb} MB · RSS {data.system.rss_mb}MB
            </span>
          </div>
          <Sparkline data={memHist} stroke="var(--chart-1)" />
        </Card>

        <Card title="🔥 CPU 사용률 (델타)">
          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold">
              {cpuHist.length ? `${cpuHist[cpuHist.length - 1]}%` : '—'}
            </span>
            <span className="text-muted-foreground mb-1 text-xs">
              인스턴스 가동 {Math.floor(data.system.uptime_s / 60)}분
            </span>
          </div>
          <Sparkline data={cpuHist} stroke="var(--chart-4)" />
        </Card>
      </div>

      <p className="text-muted-foreground text-center text-xs">
        ⓘ 시스템 지표는 Vercel 서버리스 특성상 <b>현재 처리 인스턴스 기준</b>이며, 폴링마다 다른 인스턴스일 수 있어 값이 변동할 수 있습니다.
      </p>
    </div>
  )
}
