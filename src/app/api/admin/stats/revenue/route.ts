import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { maskDisplayName } from '@/lib/display-mask'
import { viewerScopedCacheHeaders } from '@/lib/cache-headers'
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
  // 직전 동일 길이 기간 [prevFromDt, fromDt) — KPI 델타배지 비교 기준
  const prevFromDt = calcFromDate(period * 2)
  const todayStart = new Date().toISOString().slice(0, 10)

  const db = getSupabaseAdmin()

  const [
    seriesResult,
    topThemesResult,
    topSpendersResult,
    prevResult,
    todayResult,
  ] = await Promise.all([
    db
      .from('stat_revenue_dly')
      .select('stat_dt,theme_cd,rev_pi,txn_cnt')
      .gte('stat_dt', fromDt)
      .order('stat_dt', { ascending: true }),
    db.rpc('fn_top_revenue_themes', { p_from: fromDt }),
    db.rpc('fn_top_spenders', { p_from: fromDt }),
    // 직전 기간 합계용 (행 수 = 기간×테마 수준 — 소량)
    db
      .from('stat_revenue_dly')
      .select('rev_pi,txn_cnt')
      .gte('stat_dt', prevFromDt)
      .lt('stat_dt', fromDt),
    // 오늘 실시간 매출 — 일배치(stat_revenue_dly)에 아직 없는 당일분을 결제 원장에서 직접
    db
      .from('pi_pymnt')
      .select('amount')
      .eq('status', 'completed')
      .gte('reg_dtm', todayStart),
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

  const prevRows = (prevResult.data ?? []) as {
    rev_pi: number
    txn_cnt: number
  }[]
  const prev = {
    total_pi: prevRows.reduce((s, r) => s + Number(r.rev_pi), 0),
    total_txn: prevRows.reduce((s, r) => s + Number(r.txn_cnt), 0),
  }

  const todayRows = (todayResult.data ?? []) as { amount: number }[]
  const today = {
    total_pi: todayRows.reduce((s, r) => s + Number(r.amount), 0),
    txn_cnt: todayRows.length,
  }

  const body: RevenueStatsResponse = {
    period,
    from_dt: fromDt,
    series,
    topThemes,
    topSpenders,
    prev,
    today,
  }
  // 뷰어 의존(topSpenders 마스킹) → 관리자 private / 게스트 마스킹분만 공유 캐시
  return NextResponse.json(body, { headers: viewerScopedCacheHeaders(admin) })
}
