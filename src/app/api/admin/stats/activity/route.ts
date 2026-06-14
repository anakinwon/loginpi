import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { maskDisplayName } from '@/lib/display-mask'
import type {
  ActivityStatsResponse,
  ActivityDataPoint,
  TopUser,
} from '@/types/stats'

const VALID_PERIODS = [7, 30, 90, 365] as const

// KST 기준 오늘에서 period-1일 전 (집계가 KST 날짜 기준 — 043)
function calcFromDate(period: number): string {
  const d = new Date(Date.now() + 9 * 3600_000)
  d.setUTCDate(d.getUTCDate() - (period - 1))
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  // Home 통계는 게스트 포함 전체 공개 (운영 결정 2026-06-15)
  // 단, 상위 사용자 명단의 개인 식별 정보는 관리자에게만 (집계만 공개·개인항목 마스킹)
  const admin = isAdmin(await getSessionUser())

  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30
  const fromDt = calcFromDate(period)

  const db = getSupabaseAdmin()

  const [seriesResult, topUsersResult] = await Promise.all([
    db
      .from('stat_actvty_dly')
      .select('stat_dt,dau_cnt,wau_cnt,mau_cnt')
      .gte('stat_dt', fromDt)
      .order('stat_dt', { ascending: true }),
    db.rpc('fn_top_active_users', { p_from: fromDt }),
  ])

  const series: ActivityDataPoint[] = (seriesResult.data ?? []).map((row) => ({
    stat_dt: row.stat_dt as string,
    dau_cnt: Number(row.dau_cnt),
    wau_cnt: Number(row.wau_cnt),
    mau_cnt: Number(row.mau_cnt),
  }))

  const topUsers: TopUser[] = (
    (topUsersResult.data as TopUser[] | null) ?? []
  ).map((row) => ({
    // 비관리자: UID 제거 + 이름 마스킹 (개인 식별 차단, 활동 점수는 공개)
    usr_id: admin ? row.usr_id : '',
    display_nm: admin
      ? (row.display_nm ?? '(이름 없음)')
      : maskDisplayName(row.display_nm),
    activity_days: Number(row.activity_days),
    content_cnt: Number(row.content_cnt),
    action_cnt: Number(row.action_cnt),
    score: Number(row.score),
  }))

  const body: ActivityStatsResponse = {
    period,
    from_dt: fromDt,
    series,
    topUsers,
  }
  return NextResponse.json(body)
}
