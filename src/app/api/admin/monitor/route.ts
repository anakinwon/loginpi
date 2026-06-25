import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/monitor — 관리자 실시간 시스템 헬스 (PRD_22_MONITOR)
//   결제·주문은 기존 데이터(RPC) 기반 즉시 값. API 성능은 계측 테이블(연결 전엔 sample_cnt=0).
//   관리자 전용. 폴링(MVP) — SSE는 후속.

interface PaymentStatus {
  completed_cnt: number
  pending_cnt: number
  stuck_cnt: number
  success_rate: number
  avg_dur_sec: number
}
interface ActiveOrders {
  waiting_cnt: number
  processing_cnt: number
  done_1h_cnt: number
  cancelled_cnt: number
}

// 정렬 배열 백분위 (빈 배열 안전)
function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * s.length) - 1
  return s[Math.max(0, Math.min(s.length - 1, idx))]
}

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const since1h = new Date(Date.now() - 3_600_000).toISOString()

  const [payRes, ordRes, connRes, apiRes] = await Promise.all([
    db.rpc('fn_pi_payment_status'),
    db.rpc('fn_monitor_active_orders'),
    // 오늘 활동 사용자(근사 동접) — 실시간 동접은 sys_metric_conn 계측 후
    db
      .from('sys_user_actvty_log')
      .select('usr_id')
      .eq('actvty_dt', today)
      .eq('del_yn', 'N'),
    // 최근 1시간 API 계측 (연결 전엔 0건)
    db
      .from('sys_metric_req_perf')
      .select('status_code, resp_time_ms')
      .gte('reg_dtm', since1h)
      .eq('del_yn', 'N'),
  ])

  const payment = ((payRes.data as PaymentStatus[] | null)?.[0] ?? {
    completed_cnt: 0,
    pending_cnt: 0,
    stuck_cnt: 0,
    success_rate: 100,
    avg_dur_sec: 0,
  }) as PaymentStatus
  const orders = ((ordRes.data as ActiveOrders[] | null)?.[0] ?? {
    waiting_cnt: 0,
    processing_cnt: 0,
    done_1h_cnt: 0,
    cancelled_cnt: 0,
  }) as ActiveOrders

  const todayActive = new Set(
    (connRes.data ?? []).map((r: { usr_id: string }) => r.usr_id),
  ).size

  const apiRows = (apiRes.data ?? []) as {
    status_code: number
    resp_time_ms: number
  }[]
  const apiSample = apiRows.length
  const apiErrRate =
    apiSample > 0
      ? Math.round(
          (1000 * apiRows.filter((r) => r.status_code >= 400).length) /
            apiSample,
        ) / 10
      : 0
  const p95 = percentile(
    apiRows.map((r) => r.resp_time_ms),
    95,
  )

  // 시스템 — 현재 함수 인스턴스 스냅샷 (Vercel 서버리스: OS레벨 불가 → 인스턴스 기준)
  const mem = process.memoryUsage()
  const cpu = process.cpuUsage()
  const MB = 1024 * 1024
  const system = {
    rss_mb: Math.round(mem.rss / MB),
    heap_used_mb: Math.round(mem.heapUsed / MB),
    heap_total_mb: Math.round(mem.heapTotal / MB),
    heap_pct:
      mem.heapTotal > 0
        ? Math.round((1000 * mem.heapUsed) / mem.heapTotal) / 10
        : 0,
    cpu_total_ms: Math.round((cpu.user + cpu.system) / 1000), // 누적 — 클라이언트가 델타로 사용률 계산
    uptime_s: Math.round(process.uptime()),
  }

  return NextResponse.json({
    payment,
    orders,
    concurrent: { today_active: todayActive },
    api: { sample_cnt: apiSample, p95_ms: p95, error_rate: apiErrRate },
    system,
    ts: new Date().toISOString(),
  })
}
