import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { maskDisplayName } from '@/lib/display-mask'
import type {
  RevenueStatsResponse,
  RevenueDataPoint,
  TopTheme,
  TopSpender,
} from '@/types/stats'

const VALID_PERIODS = [7, 30, 90, 365] as const

function calcFromDate(period: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (period - 1))
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  // Home 통계는 게스트 포함 전체 공개 (운영 결정 2026-06-15)
  // 단, 상위 결제자 명단의 개인 식별 정보는 관리자에게만 (집계만 공개·개인항목 마스킹)
  const admin = isAdmin(await getSessionUser())

  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30
  const fromDt = calcFromDate(period)

  const db = getSupabaseAdmin()

  const [seriesResult, topThemesResult, topSpendersResult] = await Promise.all([
    db
      .from('stat_revenue_dly')
      .select('stat_dt,theme_cd,rev_pi,txn_cnt')
      .gte('stat_dt', fromDt)
      .order('stat_dt', { ascending: true }),
    db.rpc('fn_top_revenue_themes', { p_from: fromDt }),
    db.rpc('fn_top_spenders', { p_from: fromDt }),
  ])

  const series: RevenueDataPoint[] = (seriesResult.data ?? []).map((row) => ({
    stat_dt: row.stat_dt as string,
    theme_cd: row.theme_cd as string,
    rev_pi: Number(row.rev_pi),
    txn_cnt: Number(row.txn_cnt),
  }))

  const topThemes: TopTheme[] = (
    (topThemesResult.data as TopTheme[] | null) ?? []
  ).map((row) => ({
    theme_cd: row.theme_cd,
    theme_nm: row.theme_nm ?? null,
    theme_emoji: row.theme_emoji ?? null,
    total_pi: Number(row.total_pi),
    total_txn: Number(row.total_txn),
  }))

  const topSpenders: TopSpender[] = (
    (topSpendersResult.data as TopSpender[] | null) ?? []
  ).map((row) => ({
    // 비관리자: UID 제거 + 이름 마스킹 (개인 결제 식별 차단, 금액 순위는 공개)
    usr_id: admin ? row.usr_id : '',
    display_nm: admin
      ? (row.display_nm ?? '(이름 없음)')
      : maskDisplayName(row.display_nm),
    total_pi: Number(row.total_pi),
    txn_cnt: Number(row.txn_cnt),
  }))

  const body: RevenueStatsResponse = {
    period,
    from_dt: fromDt,
    series,
    topThemes,
    topSpenders,
  }
  return NextResponse.json(body)
}
