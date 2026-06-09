import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { ActivityStatsResponse, ActivityDataPoint, TopUser } from '@/types/stats'

const VALID_PERIODS = [7, 30, 90, 365] as const

function calcFromDate(period: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (period - 1))
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as typeof VALID_PERIODS[number]) ? raw : 30
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

  const series: ActivityDataPoint[] = (seriesResult.data ?? []).map(row => ({
    stat_dt: row.stat_dt as string,
    dau_cnt: Number(row.dau_cnt),
    wau_cnt: Number(row.wau_cnt),
    mau_cnt: Number(row.mau_cnt),
  }))

  const topUsers: TopUser[] = ((topUsersResult.data as TopUser[] | null) ?? []).map(row => ({
    usr_id: row.usr_id,
    display_nm: row.display_nm ?? '(이름 없음)',
    activity_days: Number(row.activity_days),
  }))

  const body: ActivityStatsResponse = { period, from_dt: fromDt, series, topUsers }
  return NextResponse.json(body)
}
