import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { viewerScopedCacheHeaders } from '@/lib/cache-headers'

// GET /api/admin/analytics/revenue-monthly — 월별 Pi 매출(최근 25개월) (Phase 22 §12 ①)
//   Z-차트(당월·누계·이동누계)·YoY 비교용. stat_revenue_dly 일별 → 월 단위 집계.
//   25개월 = 당해 가장 이른 달의 이동누계(직전 12개월) 계산 + 전년 동월 비교 커버.
//   관리자 전용(개인 식별 없음이나 추세 데이터라 admin 게이트 유지).

const MONTHS = 25

export async function GET() {
  const user = await getSessionUser()
  const admin = isAdmin(user)
  if (!admin)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0~11
  const fromD = new Date(Date.UTC(y, m - (MONTHS - 1), 1))
  const fromDt = fromD.toISOString().slice(0, 10)

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('stat_revenue_dly')
    .select('stat_dt, rev_pi, txn_cnt')
    .gte('stat_dt', fromDt)

  if (error)
    return NextResponse.json({ error: '월별 매출 조회 실패' }, { status: 500 })

  // 월(YYYY-MM)별 합산
  const agg = new Map<string, { revPi: number; txnCnt: number }>()
  for (const r of (data ?? []) as {
    stat_dt: string
    rev_pi: number
    txn_cnt: number
  }[]) {
    const ym = r.stat_dt.slice(0, 7)
    const cur = agg.get(ym) ?? { revPi: 0, txnCnt: 0 }
    cur.revPi += Number(r.rev_pi)
    cur.txnCnt += Number(r.txn_cnt)
    agg.set(ym, cur)
  }

  // 누락 월 0으로 채워 연속 시계열 생성 (오름차순)
  const months: { ym: string; revPi: number; txnCnt: number }[] = []
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1))
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const v = agg.get(ym) ?? { revPi: 0, txnCnt: 0 }
    months.push({ ym, revPi: v.revPi, txnCnt: v.txnCnt })
  }

  return NextResponse.json(
    { months },
    { headers: viewerScopedCacheHeaders(admin) },
  )
}
