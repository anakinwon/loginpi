// GET /api/analytics/kpi?link= — KPI 대시보드(PRD 12 §8-2) : dbms 자체 테이블 건수(연결·성능 수집·정합 탐지·이행 계획·파이프라인·레이크 데이터셋)
//  + 최근 14일 성능 수집 추이 + schema.pi 모니터 요약 헤드라인(실패해도 나머지는 표시). 저장 없음
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { LinkError, linkGet } from '@/lib/link/client'
import { dailyCounts, isMissingTable } from '@/lib/analytics/lake'
import { normalizeSummary } from '@/lib/monitor/rules'
import { linkGate } from '@/lib/monitor/server'

const TREND_DAYS = 14
const TREND_MAX = 1000
// ponytail: 이행(F6)·파이프라인(F7) 테이블명은 SQL 미확정 — 추정 이름, 없으면 '미구축'(null). 확정되면 이름만 바꾼다
const SOURCES = [
  { key: 'perf', table: 'dbm_prf_clct' },
  { key: 'drift', table: 'dbm_drift_run' },
  { key: 'mig', table: 'dbm_mig_plan' },
  { key: 'pipe', table: 'dbm_ppl' },
  { key: 'lake', table: 'dbm_lake_ds' },
] as const

type DbErr = { code?: string; message?: string }
type Cnt = { count: number | null; error: DbErr | null }
// 건수 | null(테이블 없음 = 미구축) | 오류
async function cnt(q: PromiseLike<Cnt>): Promise<number | null | DbErr> {
  const r = await q
  if (r.error) return isMissingTable(r.error) ? null : r.error
  return r.count ?? 0
}
const isErr = (v: number | null | DbErr): v is DbErr => v !== null && typeof v === 'object'

export const GET = withGuard(
  dbRoute(async (req) => {
    const g = await linkGate(req, req.nextUrl.searchParams.get('link'), 'LAKE')
    if (g instanceof NextResponse) return g
    const since = new Date(Date.now() - TREND_DAYS * 86_400_000).toISOString()
    // R-P1 — 서로 독립인 건수·추이·외부 요약을 한 번에. count:'exact' 는 KPI 화면이 건수를 그대로 표시하므로 의도(head:true 로 행 없음)
    const [links, srcs, trend, mon] = await Promise.all([
      cnt(db().from('dbm_lnk').select('lnk_id', { count: 'exact', head: true }).eq('usr_id', g.usrId).eq('del_yn', 'N')),
      Promise.all(
        SOURCES.map((s) =>
          cnt(db().from(s.table).select('lnk_id', { count: 'exact', head: true }).eq('lnk_id', g.linkId).eq('del_yn', 'N')),
        ),
      ),
      db()
        .from('dbm_prf_clct')
        .select('clct_dtm')
        .eq('lnk_id', g.linkId)
        .eq('del_yn', 'N')
        .gte('clct_dtm', since)
        .order('clct_dtm', { ascending: false })
        .limit(TREND_MAX),
      linkGet<unknown>(g.linkId, '/mon/summary?min=60').then(
        (raw) => ({ summary: normalizeSummary(raw, 60), code: null as string | null }),
        (e: unknown) => {
          if (e instanceof LinkError) return { summary: null, code: e.code }
          throw e
        },
      ),
    ])
    const dbErr = [links, ...srcs].find(isErr)
    if (dbErr) return dbFail(dbErr)
    if (trend.error && !isMissingTable(trend.error)) return dbFail(trend.error)
    const counts: Record<string, number | null> = { links: links as number | null }
    SOURCES.forEach((s, i) => (counts[s.key] = srcs[i] as number | null))
    return NextResponse.json(
      {
        areaNm: g.areaNm,
        counts,
        perfTrend: dailyCounts(((trend.data ?? []) as { clct_dtm: string }[]).map((r) => r.clct_dtm), TREND_DAYS),
        mon,
        at: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
