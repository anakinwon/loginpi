'use client'

import { useCallback, useEffect, useState } from 'react'
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
  ts: string
}

const REFRESH_MS = 5000

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

  const load = useCallback(async () => {
    try {
      const r = await piFetch('/api/admin/monitor')
      if (r.ok) {
        setData((await r.json()) as MonitorData)
        setErr(false)
        setLastOk(new Date().toLocaleTimeString('ko-KR'))
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
    </div>
  )
}
