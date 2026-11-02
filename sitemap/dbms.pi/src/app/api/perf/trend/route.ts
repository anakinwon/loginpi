// 용량 추이·예측(PRD 12 §3-4, P38) — GET /api/perf/trend?link=&conn=&limitGb=
//  최근 30일(요금제 보관 일수가 짧으면 그만큼, sql/035 keep_day_cnt) 수집의 DB 크기 시계열(상한 200점, ANL-R03 기간 30일) + 최소제곱 증가율 → 임계(limitGb, 기본 8GB) 도달 예상일
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { forecast } from '@/lib/perf/calc'
import { linkParams } from '@/lib/perf/server'

const DAYS = 30
const MAX_POINTS = 200
const GB = 1024 ** 3

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await linkParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p
    const limitGb = Math.min(100_000, Math.max(0.1, Number(sp.get('limitGb')) || 8))
    const { data, error } = await db()
      .from('dbm_prf_clct')
      .select('clct_dtm, db_sz_byte')
      .eq('lnk_id', p.linkId)
      .eq('conn_id', p.connId)
      .eq('del_yn', 'N')
      .not('db_sz_byte', 'is', null)
      .gte('clct_dtm', new Date(Date.now() - Math.min(DAYS, p.ctx.plan.keepDays) * 86_400_000).toISOString())
      .order('clct_dtm', { ascending: false })
      .limit(MAX_POINTS)
    if (error) return dbFail(error)
    const points = data.map((r) => ({ t: new Date(r.clct_dtm).getTime(), bytes: Number(r.db_sz_byte) })).reverse()
    return NextResponse.json({ points, limitGb, ...forecast(points, limitGb * GB) })
  }),
)
